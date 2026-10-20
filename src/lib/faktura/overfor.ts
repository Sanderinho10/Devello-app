import type { SupabaseClient } from "@supabase/supabase-js";
import { byggSalsordre, manglandeProdukt } from "./go";
import { loggFakturaVersjon } from "./versjon";
import { PogoFeil, pogoClient, type PogoKunde, type PogoKundePost } from "@/lib/regnskap/poweroffice";
import { fakturaadresse } from "@/lib/kunder/adresse";
import {
  ACCOUNTING_PROVIDER_LABELS,
  type Customer,
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
 *   1. Kunden i Go: finnes den (org.nr. fra kontaktregisteret, e-post,
 *      telefon), brukes den. Flere treff → brukeren velger. Ingen →
 *      brukeren bekrefter at den skal opprettes, med firma/person,
 *      org.nr. og fakturaadresse fra kontaktkortet når ordren har en
 *      kontakt. Uten kontakt: bare ordrens kundefelt, som før.
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
  if (!rad) return { ok: false, status: 400, error: "Ingen regnskapssystem er koblet til. Sett det opp under Selskap → Innstillinger → Ordre." };
  const kopling = rad as Kopling;
  if (kopling.provider !== "poweroffice") {
    return { ok: false, status: 400, error: `${ACCOUNTING_PROVIDER_LABELS[kopling.provider]} er ikke støttet ennå.` };
  }

  const manglar = manglandeProdukt(draft.lines, kopling.product_map ?? {});
  if (manglar.length) {
    return {
      ok: false,
      status: 400,
      error: `Produktmappingen mangler for ${manglar.map((k) => PRODUCT_MAP_LABELS[k].toLowerCase()).join(", ")}. Sett den under Selskap → Innstillinger → Ordre → Regnskapssystem.`,
    };
  }
  if (!draft.lines.some((l) => l.included && l.unit_price !== null)) {
    return { ok: false, status: 400, error: "Forslaget har ingen linjer med beløp." };
  }

  const pogo = pogoClient(kopling);
  const kontakt = await hentKontakt(admin, ordre);

  try {
    // 1. Kunden.
    let customerNo = input.customerNo?.trim() || draft.transfer_customer_no || null;
    if (!customerNo) {
      const funne = await finnKunde(pogo, ordre, kontakt);
      if (funne.length > 1) {
        return { ok: false, status: 409, error: "Flere kunder i PowerOffice Go passer. Velg hvilken.", kandidatar: funne };
      }
      if (funne.length === 1 && funne[0].CustomerNo) {
        customerNo = funne[0].CustomerNo;
      } else if (input.createCustomer) {
        const ny = await pogo.opprettKunde(foreslaaKunde(ordre, kontakt));
        if (!ny.CustomerNo) throw new Error("PowerOffice Go opprettet kunden, men svarte uten kundenummer.");
        customerNo = ny.CustomerNo;
      } else {
        return {
          ok: false,
          status: 409,
          error: "Kunden finnes ikke i PowerOffice Go.",
          needsCustomer: true,
          foreslaatt: foreslaaKunde(ordre, kontakt),
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

/**
 * Kontakten ordren er koblet til, eller null. Aldri en betingelse: finnes
 * den ikke, eller feiler oppslaget, går overføringen på ordrens kundefelt
 * som før.
 */
async function hentKontakt(admin: SupabaseClient, ordre: Order): Promise<Customer | null> {
  if (!ordre.customer_id) return null;
  try {
    const { data } = await admin
      .from("customers")
      .select("*")
      .eq("id", ordre.customer_id)
      .eq("company_id", ordre.company_id)
      .maybeSingle();
    return (data as Customer | null) ?? null;
  } catch {
    return null;
  }
}

/** Org.nr. med bare sifrene, når det er et gyldig norsk (ni sifre). */
function orgnr(kontakt: Pick<Customer, "org_nr" | "is_person"> | null | undefined): string | null {
  if (!kontakt || kontakt.is_person) return null;
  const siffer = (kontakt.org_nr ?? "").replace(/\D/g, "");
  return siffer.length === 9 ? siffer : null;
}

/** Kunden i Go, i den rekkefølgen kjennetegnene er til å stole på. */
async function finnKunde(
  pogo: ReturnType<typeof pogoClient>,
  ordre: Order,
  kontakt: Customer | null,
): Promise<PogoKunde[]> {
  const org = orgnr(kontakt);
  if (org) {
    const treff = await pogo.hentKundar({ organizationNumbers: [org] });
    const eksakte = treff.filter((k) => (k.OrganizationNumber ?? "").replace(/\D/g, "") === org);
    if (eksakte.length) return eksakte;
  }
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

/**
 * Det vi ville opprettet i Go.
 *
 * Navn, e-post og telefon er ordrens — det er dem jobben ble gjort for.
 * Med en kontakt fra registeret kommer firma/person, org.nr. og
 * fakturaadressen derfra, og e-post og telefon fylles inn om ordren mangler
 * dem. Uten kontakt gjetter vi som før: privatperson uten kontaktperson,
 * bedrift med, og jobbadressen som postadresse.
 */
export function foreslaaKunde(
  ordre: Pick<Order, "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "site_address">,
  kontakt?: Customer | null,
): PogoKundePost {
  const namn = ordre.customer_name.trim() || kontakt?.name.trim() || "Ukjent kunde";
  const erPerson = kontakt ? kontakt.is_person : !ordre.customer_contact;
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
  const org = orgnr(kontakt);
  if (org) dto.OrganizationNumber = org;

  const epost = ordre.customer_email?.trim() || kontakt?.email?.trim();
  if (epost) {
    dto.EmailAddress = epost;
    dto.InvoiceEmailAddress = epost;
  }
  const tlf = ordre.customer_phone?.trim() || kontakt?.phone?.trim();
  if (tlf) dto.PhoneNumber = tlf;

  const faktura = kontakt ? fakturaadresse(kontakt) : null;
  if (faktura && (faktura.linje1.trim() || faktura.sted.trim())) {
    const landkode = landkodeFor(faktura.land);
    dto.MailAddress = {
      ...(faktura.linje1.trim() ? { AddressLine1: faktura.linje1.trim() } : {}),
      ...(faktura.linje2.trim() ? { AddressLine2: faktura.linje2.trim() } : {}),
      ...(faktura.postnr.trim() ? { ZipCode: faktura.postnr.trim() } : {}),
      ...(faktura.sted.trim() ? { City: faktura.sted.trim() } : {}),
      ...(landkode ? { CountryCode: landkode } : {}),
    };
    return dto;
  }

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

/**
 * ISO-koden Go vil ha for landet på kontaktkortet. Et land vi ikke kjenner
 * sendes uten kode — da velger Go selv, heller enn at vi gjetter feil.
 */
const LANDKODER: Record<string, string> = {
  norge: "NO",
  norway: "NO",
  sverige: "SE",
  danmark: "DK",
  finland: "FI",
  island: "IS",
  tyskland: "DE",
  polen: "PL",
  litauen: "LT",
  storbritannia: "GB",
};

export function landkodeFor(land: string | null | undefined): string | null {
  const l = (land ?? "").trim().toLowerCase();
  if (!l) return "NO";
  if (/^[a-z]{2}$/.test(l)) return l.toUpperCase();
  return LANDKODER[l] ?? null;
}

function kjeldeIdar(draft: InvoiceDraft, type: "time_entry" | "material_entry"): string[] {
  const ids = new Set<string>();
  for (const l of draft.lines) {
    if (!l.included) continue;
    for (const s of l.sources) if (s.type === type) ids.add(s.id);
  }
  return [...ids];
}
