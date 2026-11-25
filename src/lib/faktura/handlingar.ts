import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { akontoBelop, akontoLinje, hentAkonto, maalformFor, manglandeFratrekk } from "./akonto";
import { overforTilRegnskap } from "./overfor";
import { reknOmLinjer, round2, summer } from "./resolver";
import type { InvoiceLine } from "./typar";
import { loggFakturaVersjon } from "./versjon";
import { loggAktivitet } from "@/lib/aktivitet";
import { registrerBruk } from "@/lib/billing/subscription";
import { adresseTekst, hovedadresse } from "@/lib/kunder/adresse";
import { tal } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import type { Customer, InvoiceDraft, Order, QuoteDocument } from "@/lib/types";

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
      // Fratrekk for a konto (0071): beløpet følger det som ble fakturert,
      // så bare teksten og om linjen er med kan endres.
      if (gammal?.kind === "akonto_fratrekk") {
        nye.push({ ...gammal, description, included: raa.included === undefined ? gammal.included : Boolean(raa.included) });
        continue;
      }
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
    // Et fratrekk kan holdes utenfor, men ikke fjernes: da ville ingen se
    // at kunden alt har betalt a konto.
    const sendt = new Set(nye.map((l) => l.id));
    for (const l of draft.lines) if (l.kind === "akonto_fratrekk" && !sendt.has(l.id)) nye.push(l);
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

/**
 * Ny akontofaktura på ordren (0071).
 *
 * Body: { amount?: tall, percent?: tall } — et beløp eks. mva, eller en
 * prosent av avtalt pris. Svarer med utkastet: én linje «A konto nr. N»,
 * som kan redigeres, godkjennes og overføres som enhver annen faktura.
 * Ordren står åpen etterpå, og sluttfakturaen trekker beløpet fra.
 */
export async function lagAkonto(
  admin: SupabaseClient,
  session: SessionContext,
  ordre: Order,
  body: Record<string, unknown>,
): Promise<NextResponse> {
  if (ordre.status === "fakturert") return NextResponse.json({ error: "Ordren er allerede fakturert." }, { status: 400 });
  if (ordre.status === "avbrutt") return NextResponse.json({ error: "Ordren er avbrutt." }, { status: 400 });

  const oppgitt = (v: unknown) => v !== undefined && v !== null && v !== "";
  const percent = oppgitt(body.percent) ? tal(body.percent) : null;
  const amount = oppgitt(body.amount) ? tal(body.amount) : null;
  if (oppgitt(body.percent) && percent === null) return NextResponse.json({ error: "Ugyldig prosent." }, { status: 400 });
  if (oppgitt(body.amount) && amount === null) return NextResponse.json({ error: "Ugyldig beløp." }, { status: 400 });
  const r = akontoBelop({
    amount,
    percent,
    grunnlag: ordre.planned_total === null ? null : Number(ordre.planned_total),
  });
  if ("feil" in r) return NextResponse.json({ error: r.feil }, { status: 400 });

  const tidligere = await hentAkonto(admin, ordre);
  const aapen = tidligere.find((a) => a.status !== "overfort");
  if (aapen) {
    return NextResponse.json(
      { error: `A konto nr. ${aapen.akonto_no} er ikke overført ennå. Overfør eller slett den først.`, id: aapen.id },
      { status: 409 },
    );
  }
  const nr = Math.max(0, ...tidligere.map((a) => a.akonto_no ?? 0)) + 1;
  const document = (ordre.quote_snapshot?.document ?? null) as QuoteDocument | null;
  const lines = [akontoLinje({ nr, belop: r.belop, prosent: r.prosent, vatPct: Number(document?.vat_rate ?? 25) })];
  const maalform = await maalformFor(admin, session.companyId);

  const { data, error } = await admin
    .from("invoice_drafts")
    .insert({
      company_id: session.companyId,
      order_id: ordre.id,
      customer_id: ordre.customer_id ?? null,
      is_akonto: true,
      akonto_no: nr,
      status: "utkast",
      strategy: "akonto",
      lines,
      totals: summer(lines),
      invoice_text: `${maalform === "nn" ? "Gjeld" : "Gjelder"} ordre ${ordre.order_no}: ${ordre.title}`.slice(0, 300),
      customer_reference: ordre.customer_contact ?? null,
      notes: [],
      questions: [],
      created_by: session.userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Kunne ikke lage akontofakturaen: ${error.message}`);
  await loggAktivitet(admin, {
    companyId: session.companyId,
    objekt: "faktura",
    objektId: data.id,
    handling: "opprettet",
    detalj: `A konto nr. ${nr} på ordre #${ordre.order_no}`,
    userId: session.userId,
  });
  return NextResponse.json(data);
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
  // En akontofaktura kan gå før jobben er i gang (forskudd ved bestilling).
  const kanFaktureres = ordre && (ordre.status === "paagaar" || ordre.status === "ferdig" || (draft.is_akonto && ordre.status === "opna"));
  if (ordre && !kanFaktureres) {
    return NextResponse.json(
      {
        error: draft.is_akonto
          ? "Ordren er fakturert eller avbrutt, og kan ikke faktureres a konto."
          : "Ordren må være i gang eller ferdig for å faktureres.",
      },
      { status: 400 },
    );
  }
  // Sluttfakturaen lukker ordren, så a konto må være gjort opp først: alt
  // som er overført skal være trukket fra, og ingenting skal ligge igjen.
  if (ordre && !draft.is_akonto) {
    const akontoar = await hentAkonto(admin, ordre);
    const aapen = akontoar.find((a) => a.status !== "overfort");
    if (aapen) {
      return NextResponse.json(
        { error: `A konto nr. ${aapen.akonto_no} er ikke overført ennå. Overfør eller slett den før sluttfakturaen.` },
        { status: 400 },
      );
    }
    const utan = manglandeFratrekk(draft.lines, akontoar);
    if (utan.length) {
      return NextResponse.json(
        { error: `A konto nr. ${utan.map((a) => a.akonto_no).join(", ")} er ikke trukket fra. Lag et nytt forslag.` },
        { status: 400 },
      );
    }
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
    // holder styr på det. Akonto og sluttfaktura på samme ordre teller som én.
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
