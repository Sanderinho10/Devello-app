import type { SupabaseClient } from "@supabase/supabase-js";
import { byggSalsordre, manglandeProdukt } from "./go";
import { loggFakturaVersjon } from "./versjon";
import { PogoFeil, pogoClient, type PogoKunde, type PogoKundePost } from "@/lib/regnskap/poweroffice";
import {
  ACCOUNTING_PROVIDER_LABELS,
  PRODUCT_MAP_LABELS,
  type ConnectionSettings,
  type InvoiceDraft,
  type Order,
  type ProductMap,
} from "@/lib/types";

/**
 * Overføringen: fakturaforslag → salgsordre-utkast i PowerOffice Go.
 *
 * Rekkefølgen er valgt så ingenting halvgjort blir stående:
 *
 *   1. Kunden i Go: finnes den (e-post, telefon), brukes den. Flere treff →
 *      brukeren velger. Ingen → brukeren bekrefter at den skal opprettes.
 *   2. Finnes ordren alt i Go (ExternalImportReference = utkastets id, eller
 *      id-en vi lagret sist)? Da lages ingen ny — det er idempotensen.
 *   3. POST /SalesOrders/Complete med status Draft.
 *   4. Først når Go har svart ja: utkastet låses, føringene merkes
 *      fakturert, ordren blir fakturert. Feiler Go, endres ingenting annet
 *      enn transfer_error, og knappen kan trykkes igjen.
 */

export type OverforResultat =
  | { ok: true; draft: InvoiceDraft; alleredeOverfort: boolean }
  | { ok: false; status: 400 | 409 | 502; error: string; needsCustomer?: true; foreslaatt?: PogoKundePost; kandidatar?: PogoKunde[] };

interface Kopling {
  id: string;
  provider: "poweroffice" | "tripletex";
  environment: "production" | "demo";
  client_key: string;
  status: string;
  product_map: ProductMap;
  settings: ConnectionSettings;
}

export async function overforTilRegnskap(
  admin: SupabaseClient,
  input: {
    draft: InvoiceDraft;
    ordre: Order;
    userId: string;
    createCustomer?: boolean;
    customerNo?: string | null;
  },
): Promise<OverforResultat> {
  const { draft, ordre } = input;

  const { data: rad } = await admin
    .from("accounting_connections")
    .select("id, provider, environment, client_key, status, product_map, settings")
    .eq("company_id", ordre.company_id)
    .neq("status", "kopla_fra")
    .maybeSingle();
  if (!rad) return { ok: false, status: 400, error: "Ingen regnskapssystem er koblet til. Sett det opp under Ordre → Innstillinger." };
  const kopling = rad as Kopling;
  if (kopling.provider !== "poweroffice") {
    return { ok: false, status: 400, error: `${ACCOUNTING_PROVIDER_LABELS[kopling.provider]} er ikke støttet ennå.` };
  }

  const manglar = manglandeProdukt(draft.lines, kopling.product_map ?? {});
  if (manglar.length) {
    return {
      ok: false,
      status: 400,
      error: `Produktmappingen mangler for ${manglar.map((k) => PRODUCT_MAP_LABELS[k].toLowerCase()).join(", ")}. Sett den under Ordre → Innstillinger → Regnskapssystem.`,
    };
  }
  if (!draft.lines.some((l) => l.included && l.unit_price !== null)) {
    return { ok: false, status: 400, error: "Forslaget har ingen linjer med beløp." };
  }

  const pogo = pogoClient(kopling);

  try {
    // 1. Kunden.
    let customerNo = input.customerNo?.trim() || draft.transfer_customer_no || null;
    if (!customerNo) {
      const funne = await finnKunde(pogo, ordre);
      if (funne.length > 1) {
        return { ok: false, status: 409, error: "Flere kunder i PowerOffice Go passer. Velg hvilken.", kandidatar: funne };
      }
      if (funne.length === 1 && funne[0].CustomerNo) {
        customerNo = funne[0].CustomerNo;
      } else if (input.createCustomer) {
        const ny = await pogo.opprettKunde(foreslaaKunde(ordre));
        if (!ny.CustomerNo) throw new Error("PowerOffice Go opprettet kunden, men svarte uten kundenummer.");
        customerNo = ny.CustomerNo;
      } else {
        return {
          ok: false,
          status: 409,
          error: "Kunden finnes ikke i PowerOffice Go.",
          needsCustomer: true,
          foreslaatt: foreslaaKunde(ordre),
        };
      }
    }

    // 2. Finnes ordren alt?
    let go = draft.transfer_external_id ? await pogo.hentSalsordre(draft.transfer_external_id) : null;
    if (!go) go = await pogo.finnSalsordreViaRef(draft.id);
    const alleredeOverfort = go !== null;

    // 3. Opprett.
    if (!go) {
      const dto = byggSalsordre({
        draft,
        ordre,
        customerNo,
        productMap: kopling.product_map ?? {},
        settings: kopling.settings ?? {},
      });
      go = await pogo.opprettSalsordre(dto);
      if (!go.Id) throw new Error("PowerOffice Go opprettet ordren, men svarte uten id.");
    }

    // 4. Lås alt hos oss.
    const naa = new Date().toISOString();
    const { data: oppdatert, error } = await admin
      .from("invoice_drafts")
      .update({
        status: "overfort",
        transfer_provider: "poweroffice",
        transfer_external_id: go.Id,
        transfer_order_no: go.SalesOrderNo,
        transfer_customer_no: customerNo,
        transferred_at: naa,
        transfer_error: null,
      })
      .eq("id", draft.id)
      .select("*")
      .single();
    if (error) throw new Error(`Ordren ligger i PowerOffice Go (${go.SalesOrderNo ?? go.Id}), men kunne ikke lagres hos oss: ${error.message}`);
    const ferdig = oppdatert as InvoiceDraft;

    await loggFakturaVersjon(admin, {
      draftId: draft.id,
      source: "overfort",
      snapshot: { lines: ferdig.lines, totals: ferdig.totals, invoice_text: ferdig.invoice_text },
      previous: { lines: draft.lines, totals: draft.totals, invoice_text: draft.invoice_text },
      userId: input.userId,
    });

    const timeIds = kjeldeIdar(draft, "time_entry");
    const matIds = kjeldeIdar(draft, "material_entry");
    if (timeIds.length) {
      await admin.from("time_entries").update({ invoice_draft_id: draft.id }).in("id", timeIds).is("invoice_draft_id", null);
    }
    if (matIds.length) {
      await admin.from("material_entries").update({ invoice_draft_id: draft.id }).in("id", matIds).is("invoice_draft_id", null);
    }

    await admin
      .from("orders")
      .update({ status: "fakturert", closed_at: naa })
      .eq("id", ordre.id)
      .eq("company_id", ordre.company_id);
    await admin.from("order_events").insert({
      order_id: ordre.id,
      kind: "faktura",
      note: `Fakturaforslag overført til PowerOffice Go${go.SalesOrderNo ? `, ordre ${go.SalesOrderNo}` : ""}`,
      created_by: input.userId,
    });

    return { ok: true, draft: ferdig, alleredeOverfort };
  } catch (err) {
    const melding = err instanceof Error ? err.message : String(err);
    await admin
      .from("invoice_drafts")
      .update({ status: "feil", transfer_error: melding })
      .eq("id", draft.id);
    return { ok: false, status: err instanceof PogoFeil && err.status === 403 ? 400 : 502, error: melding };
  }
}

/** Kunden i Go, i den rekkefølgen kjennetegnene er til å stole på. */
async function finnKunde(pogo: ReturnType<typeof pogoClient>, ordre: Order): Promise<PogoKunde[]> {
  const epost = ordre.customer_email?.trim().toLowerCase();
  if (epost) {
    const treff = await pogo.hentKundar({ emailAddresses: [epost] });
    const eksakte = treff.filter((k) => k.EmailAddress?.trim().toLowerCase() === epost);
    if (eksakte.length) return eksakte;
  }
  const tlf = ordre.customer_phone?.replace(/[^\d+]/g, "");
  if (tlf && tlf.length >= 8) {
    const treff = await pogo.hentKundar({ phoneNumbers: [tlf] });
    const eksakte = treff.filter((k) => (k.PhoneNumber ?? "").replace(/[^\d+]/g, "") === tlf);
    if (eksakte.length) return eksakte;
  }
  return [];
}

/** Det vi ville opprettet: privatperson uten kontaktperson, bedrift med. */
export function foreslaaKunde(ordre: Pick<Order, "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "site_address">): PogoKundePost {
  const namn = ordre.customer_name.trim() || "Ukjent kunde";
  const erPerson = !ordre.customer_contact;
  const dto: PogoKundePost = { Name: namn, IsPerson: erPerson };
  if (erPerson) {
    const deler = namn.split(/\s+/);
    if (deler.length > 1) {
      dto.LastName = deler.pop();
      dto.FirstName = deler.join(" ");
    } else {
      dto.LastName = namn;
    }
  }
  if (ordre.customer_email?.trim()) {
    dto.EmailAddress = ordre.customer_email.trim();
    dto.InvoiceEmailAddress = ordre.customer_email.trim();
  }
  if (ordre.customer_phone?.trim()) dto.PhoneNumber = ordre.customer_phone.trim();
  const adresse = ordre.site_address?.trim();
  if (adresse) {
    // «Storgata 12, 5003 Bergen» → linje, postnummer, sted. Ellers alt på linje 1.
    const m = adresse.match(/^(.*?),?\s*(\d{4})\s+([^\d,]+)$/);
    dto.MailAddress = m
      ? { AddressLine1: m[1].trim(), ZipCode: m[2], City: m[3].trim(), CountryCode: "NO" }
      : { AddressLine1: adresse, CountryCode: "NO" };
  }
  return dto;
}

function kjeldeIdar(draft: InvoiceDraft, type: "time_entry" | "material_entry"): string[] {
  const ids = new Set<string>();
  for (const l of draft.lines) {
    if (!l.included) continue;
    for (const s of l.sources) if (s.type === type) ids.add(s.id);
  }
  return [...ids];
}
