import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { overforTilRegnskap } from "./overfor";
import { reknOmLinjer, round2 } from "./resolver";
import type { InvoiceLine } from "./typar";
import { loggFakturaVersjon } from "./versjon";
import { loggAktivitet } from "@/lib/aktivitet";
import { registrerBruk } from "@/lib/billing/subscription";
import { adresseTekst, hovedadresse } from "@/lib/kunder/adresse";
import { tal } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import type { Customer, InvoiceDraft, Order } from "@/lib/types";

/**
 * Det man gjør med en faktura, uansett hvor den kom fra.
 *
 * En faktura er laget fra en ordre (forslaget bygd av tilbudet, timene og
 * materiellet) eller rett i fakturafanen (0065) — da er ordre null, og
 * tittelen og kundefeltene står på utkastet. Redigering, godkjenning og
 * overføring er det samme for begge, så rutene under /api/fakturaer og
 * /api/orders/[id]/faktura kaller hit.
 */

export interface UtkastOgOrdre {
  draft: InvoiceDraft;
  ordre: Order | null;
}

/** Modulen er på (403), fakturaen er selskapets (404), og ordren den hører til. */
export async function utkastMedId(
  admin: SupabaseClient,
  session: SessionContext,
  draftId: string,
): Promise<UtkastOgOrdre | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data: draft } = await admin
    .from("invoice_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "Fant ikke fakturaen" }, { status: 404 });

  let ordre: Order | null = null;
  if (draft.order_id) {
    const { data } = await admin
      .from("orders")
      .select("*")
      .eq("id", draft.order_id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    ordre = (data as Order | null) ?? null;
  }
  return { draft: draft as InvoiceDraft, ordre };
}

/** Kundefeltene på en faktura uten ordre, fra kontaktkortet. */
export function kundefeltFra(kunde: Customer): Pick<
  InvoiceDraft,
  "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "customer_address"
> {
  return {
    customer_name: kunde.name,
    customer_contact: kunde.is_person ? null : kunde.contact,
    customer_email: kunde.email,
    customer_phone: kunde.phone,
    customer_address: adresseTekst(hovedadresse(kunde)) || null,
  };
}

/**
 * Brukerens redigering: linjer, fakturatekst, Deres ref., fakturakunden og
 * (uten ordre) tittelen.
 *
 * Redigeringen sender linjene tilbake slik brukeren vil ha dem; koden
 * regner linjesum og totaler på nytt, og merker en endret pris som
 * manuell. Kilder og linjetype kommer aldri fra klienten — de hentes fra
 * linja med samme id i det lagrede utkastet.
 */
export async function redigerUtkast(
  admin: SupabaseClient,
  session: SessionContext,
  { draft, ordre }: UtkastOgOrdre,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (draft.status === "overfort") {
    return NextResponse.json({ error: "Fakturaen er overført til regnskapssystemet og kan ikke endres." }, { status: 400 });
  }
  const endringer: Record<string, unknown> = {};

  // Fakturakunden. null: tilbake til kunden på ordren. Kundenummeret i
  // regnskapssystemet som ble valgt for den forrige kunden, gjelder ikke
  // lenger. Uten ordre følger kundefeltene på utkastet med.
  if (body.customer_id !== undefined) {
    let ny: string | null = null;
    let kunde: Customer | null = null;
    if (typeof body.customer_id === "string" && body.customer_id) {
      const { data } = await admin
        .from("customers")
        .select("*")
        .eq("id", body.customer_id)
        .eq("company_id", session.companyId)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: "Fant ikke kunden." }, { status: 400 });
      kunde = data as Customer;
      ny = kunde.id;
    } else {
      ny = ordre?.customer_id ?? null;
    }
    if (ny !== draft.customer_id) {
      endringer.customer_id = ny;
      endringer.transfer_customer_no = null;
      if (!ordre && kunde) Object.assign(endringer, kundefeltFra(kunde));
    }
  }

  if (body.title !== undefined && !ordre) {
    endringer.title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  }
  if (body.invoice_text !== undefined) {
    endringer.invoice_text = typeof body.invoice_text === "string" && body.invoice_text.trim() ? body.invoice_text.trim() : null;
  }
  if (body.customer_reference !== undefined) {
    endringer.customer_reference =
      typeof body.customer_reference === "string" && body.customer_reference.trim() ? body.customer_reference.trim().slice(0, 120) : null;
  }

  if (body.lines !== undefined) {
    if (!Array.isArray(body.lines)) return NextResponse.json({ error: "lines må være en liste." }, { status: 400 });
    const eksisterande = new Map(draft.lines.map((l) => [l.id, l]));
    const nye: InvoiceLine[] = [];
    for (const raa of body.lines as Record<string, unknown>[]) {
      const lid = typeof raa.id === "string" ? raa.id : "";
      const gammal = eksisterande.get(lid);
      const description = typeof raa.description === "string" ? raa.description.trim() : (gammal?.description ?? "");
      if (!description) return NextResponse.json({ error: "En linje mangler beskrivelse." }, { status: 400 });
      const quantity = raa.quantity === undefined ? (gammal?.quantity ?? 0) : tal(raa.quantity);
      if (quantity === null || quantity < 0) return NextResponse.json({ error: `Ugyldig mengde på «${description}».` }, { status: 400 });
      let unit_price: number | null;
      if (raa.unit_price === undefined) unit_price = gammal?.unit_price ?? null;
      else if (raa.unit_price === null || raa.unit_price === "") unit_price = null;
      else {
        unit_price = tal(raa.unit_price);
        if (unit_price === null || unit_price < 0) return NextResponse.json({ error: `Ugyldig pris på «${description}».` }, { status: 400 });
      }
      if (gammal) {
        nye.push({
          ...gammal,
          description,
          quantity,
          unit: typeof raa.unit === "string" && raa.unit.trim() ? raa.unit.trim().slice(0, 12) : gammal.unit,
          unit_price,
          included: raa.included === undefined ? gammal.included : Boolean(raa.included),
        });
      } else {
        // En linje brukeren la til selv: ingen kilder, alltid manuell.
        nye.push({
          id: lid || crypto.randomUUID(),
          kind: "tekst",
          description,
          quantity,
          unit: typeof raa.unit === "string" && raa.unit.trim() ? raa.unit.trim().slice(0, 12) : "stk",
          unit_price,
          unit_price_manual: unit_price !== null,
          line_total: 0,
          vat_pct: draft.lines[0]?.vat_pct ?? 25,
          included: raa.included === undefined ? true : Boolean(raa.included),
          sources: [],
          ai_reason: null,
        });
      }
    }
    const om = reknOmLinjer(nye, draft.lines);
    endringer.lines = om.lines;
    endringer.totals = om.totals;
  }

  if (Object.keys(endringer).length === 0) return NextResponse.json(draft);

  // En redigering av en godkjent faktura trekker godkjenningen: det som
  // ble godkjent er ikke lenger det som ligger der.
  if (draft.status === "godkjent" || draft.status === "feil") {
    endringer.status = "utkast";
    endringer.approved_by = null;
    endringer.approved_at = null;
    endringer.transfer_error = null;
  }

  const { data, error } = await admin
    .from("invoice_drafts")
    .update(endringer)
    .eq("id", draft.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const lagra = data as InvoiceDraft;
  await loggFakturaVersjon(admin, {
    draftId: draft.id,
    source: "redigering",
    snapshot: { lines: lagra.lines, totals: lagra.totals, invoice_text: lagra.invoice_text },
    previous: { lines: draft.lines, totals: draft.totals, invoice_text: draft.invoice_text },
    userId: session.userId,
  });

  return NextResponse.json({ ...lagra, totals: { ...lagra.totals, total: round2(lagra.totals.total) } });
}

/** Godkjenner fakturaen: et menneske har sett over. Angres med angreGodkjenning. */
export async function godkjennUtkast(
  admin: SupabaseClient,
  session: SessionContext,
  draft: InvoiceDraft,
): Promise<NextResponse> {
  if (draft.status === "overfort") {
    return NextResponse.json({ error: "Fakturaen er allerede overført." }, { status: 400 });
  }
  if (!draft.lines.some((l) => l.included && l.unit_price !== null)) {
    return NextResponse.json({ error: "Fakturaen har ingen linjer med beløp." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("invoice_drafts")
    .update({ status: "godkjent", approved_by: session.userId, approved_at: new Date().toISOString(), transfer_error: null })
    .eq("id", draft.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await loggAktivitet(admin, {
    companyId: session.companyId,
    objekt: "faktura",
    objektId: draft.id,
    handling: "godkjent",
    userId: session.userId,
  });
  return NextResponse.json(data);
}

/** Tilbake til utkast. Bare før overføring. */
export async function angreGodkjenning(
  admin: SupabaseClient,
  session: SessionContext,
  draft: InvoiceDraft,
): Promise<NextResponse> {
  if (draft.status === "overfort") {
    return NextResponse.json({ error: "Fakturaen er overført og kan ikke endres." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("invoice_drafts")
    .update({ status: "utkast", approved_by: null, approved_at: null, transfer_error: null })
    .eq("id", draft.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (draft.status === "godkjent") {
    await loggAktivitet(admin, {
      companyId: session.companyId,
      objekt: "faktura",
      objektId: draft.id,
      handling: "godkjenning_angret",
      userId: session.userId,
    });
  }
  return NextResponse.json(data);
}

/**
 * Overfør den godkjente fakturaen til regnskapssystemet som ordreutkast.
 *
 * Body: { createCustomer?: boolean, customerNo?: string }. Svarer 409 med
 * { needsCustomer, foreslaatt } når kunden må opprettes, og 409 med
 * { kandidatar } når flere passer — UI-et spør og kaller på nytt.
 */
export async function overforUtkast(
  admin: SupabaseClient,
  session: SessionContext,
  { draft, ordre }: UtkastOgOrdre,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (draft.status === "overfort") {
    return NextResponse.json({ error: "Fakturaen er allerede overført.", draft }, { status: 400 });
  }
  if (draft.status !== "godkjent" && draft.status !== "feil") {
    return NextResponse.json({ error: "Godkjenn fakturaen først." }, { status: 400 });
  }
  if (draft.order_id && !ordre) {
    return NextResponse.json({ error: "Fant ikke ordren fakturaen hører til." }, { status: 404 });
  }
  if (ordre && ordre.status !== "paagaar" && ordre.status !== "ferdig") {
    return NextResponse.json({ error: "Ordren må være i gang eller ferdig for å faktureres." }, { status: 400 });
  }

  const resultat = await overforTilRegnskap(admin, {
    draft,
    ordre,
    userId: session.userId,
    createCustomer: body.createCustomer === true,
    customerNo: typeof body.customerNo === "string" ? body.customerNo : null,
  });

  if (resultat.ok) {
    // Én faktura per ordre (eller per faktura uten ordre), talt første gang
    // den overføres. Ny overføring av samme er gratis — den unike indeksen
    // holder styr på det.
    await registrerBruk(admin, { companyId: session.companyId, kind: "faktura", referenceId: ordre?.id ?? draft.id });
    await loggAktivitet(admin, {
      companyId: session.companyId,
      objekt: "faktura",
      objektId: draft.id,
      handling: "overfort",
      detalj: resultat.draft.transfer_order_no
        ? `Ordre ${resultat.draft.transfer_order_no} i regnskapssystemet`
        : null,
      userId: session.userId,
    });
    return NextResponse.json(resultat);
  }
  const { ok: _ok, status, ...rest } = resultat;
  void _ok;
  return NextResponse.json(rest, { status });
}
