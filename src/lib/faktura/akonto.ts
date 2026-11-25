import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2, summer } from "./resolver";
import type { InvoiceLine } from "./typar";
import { loggFakturaVersjon } from "./versjon";
import type { InvoiceDraft } from "@/lib/types";

/**
 * Akontofakturering (0071): fakturer et beløp underveis, trekk det fra til slutt.
 *
 * En akontofaktura er et eget utkast på ordren med én linje av typen
 * «akonto». Beløpet er det brukeren skrev, eller en prosent av avtalt pris
 * regnet her. Den lukker ikke ordren når den overføres.
 *
 * Sluttfakturaen får én linje «akonto_fratrekk» per overført akontofaktura,
 * med akontofakturaen som kilde. Fratrekket er mengde −1 × beløpet som ble
 * fakturert a konto, på samme produkt som akontolinjen — så det nuller seg
 * ut på samme konto i regnskapet. Linjene legges inn av koden, aldri av
 * agenten, og beløpet kan ikke redigeres: det følger det som faktisk ble
 * fakturert.
 *
 * De rene funksjonene øverst prøves i scripts/test-faktura.ts.
 */

type Maalform = "nb" | "nn";

export type AkontoGrunnlag = Pick<InvoiceDraft, "id" | "akonto_no" | "lines" | "transferred_at">;

/**
 * Beløpet på en akontofaktura, eks. mva. Prosent regnes av avtalt pris
 * (planned_total på ordren) og går foran et beløp. Svarer med en feil
 * brukeren kan lese når noe mangler.
 */
export function akontoBelop(input: {
  amount: number | null;
  percent: number | null;
  /** Avtalt pris eks. mva, eller null når ordren ikke har noen. */
  grunnlag: number | null;
}): { belop: number; prosent: number | null } | { feil: string } {
  if (input.percent !== null) {
    if (!(input.percent > 0) || input.percent > 100) return { feil: "Prosenten må være mellom 0 og 100." };
    if (input.grunnlag === null || !(input.grunnlag > 0)) {
      return { feil: "Ordren har ingen avtalt pris å regne prosent av. Skriv et beløp i stedet." };
    }
    const belop = round2((input.grunnlag * input.percent) / 100);
    if (!(belop > 0)) return { feil: "Beløpet ble null. Skriv et beløp i stedet." };
    return { belop, prosent: input.percent };
  }
  if (input.amount === null || !(input.amount > 0)) return { feil: "Skriv et beløp eller en prosent." };
  return { belop: round2(input.amount), prosent: null };
}

/** Linjen på akontofakturaen: «A konto nr. 1 – 30 % av avtalt pris». */
export function akontoLinje(input: { nr: number; belop: number; prosent: number | null; vatPct: number }): InvoiceLine {
  const prosent = input.prosent === null ? "" : ` – ${input.prosent.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} % av avtalt pris`;
  return {
    id: randomUUID(),
    kind: "akonto",
    description: `A konto nr. ${input.nr}${prosent}`,
    quantity: 1,
    unit: "stk",
    unit_price: input.belop,
    line_total: input.belop,
    vat_pct: input.vatPct,
    included: true,
    sources: [],
    ai_reason: null,
  };
}

/**
 * Det som er fakturert a konto på et utkast, eks. mva: akontolinjene som er
 * med. Andre linjer brukeren har lagt på akontofakturaen er vanlig salg og
 * skal ikke trekkes fra.
 */
export function akontoSum(draft: Pick<InvoiceDraft, "lines">): number {
  return round2(
    draft.lines.reduce((acc, l) => (l.kind === "akonto" && l.included && l.unit_price !== null ? acc + l.line_total : acc), 0),
  );
}

/** Fratrekket på sluttfakturaen for én overført akontofaktura. Null når den ikke har noe beløp. */
export function fratrekkLinje(akonto: AkontoGrunnlag, maalform: Maalform = "nb"): InvoiceLine | null {
  const belop = akontoSum(akonto);
  if (!(belop > 0)) return null;
  const dato = akonto.transferred_at
    ? `, fakturert ${new Intl.DateTimeFormat("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Oslo" }).format(new Date(akonto.transferred_at))}`
    : "";
  return {
    id: randomUUID(),
    kind: "akonto_fratrekk",
    description: `${maalform === "nn" ? "Frådrag" : "Fratrekk"}: a konto nr. ${akonto.akonto_no ?? "?"}${dato}`,
    quantity: -1,
    unit: "stk",
    unit_price: belop,
    line_total: -belop,
    vat_pct: akonto.lines.find((l) => l.kind === "akonto")?.vat_pct ?? 25,
    included: true,
    sources: [{ type: "invoice_draft", id: akonto.id }],
    ai_reason: null,
  };
}

/** Akontofakturaene som ikke har en fratrekkslinje i disse linjene ennå. */
export function manglandeFratrekk<T extends Pick<InvoiceDraft, "id">>(lines: InvoiceLine[], akontoar: T[]): T[] {
  const trukket = new Set(
    lines.filter((l) => l.kind === "akonto_fratrekk").flatMap((l) => l.sources.filter((s) => s.type === "invoice_draft").map((s) => s.id)),
  );
  return akontoar.filter((a) => !trukket.has(a.id));
}

/** Linjene med et fratrekk for hver akontofaktura som mangler ett, nederst. */
export function medFratrekk(lines: InvoiceLine[], akontoar: AkontoGrunnlag[], maalform: Maalform = "nb"): InvoiceLine[] {
  const nye = manglandeFratrekk(lines, akontoar)
    .map((a) => fratrekkLinje(a, maalform))
    .filter((l): l is InvoiceLine => l !== null);
  return nye.length ? [...lines, ...nye] : lines;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

/** Alle akontofakturaene på ordren, i nummerrekkefølge. */
export async function hentAkonto(
  admin: SupabaseClient,
  ordre: { id: string; company_id: string },
): Promise<InvoiceDraft[]> {
  const { data, error } = await admin
    .from("invoice_drafts")
    .select("*")
    .eq("order_id", ordre.id)
    .eq("company_id", ordre.company_id)
    .eq("is_akonto", true)
    .order("akonto_no", { ascending: true });
  if (error) throw new Error(`Kunne ikke hente akontofakturaene: ${error.message}`);
  return (data ?? []) as InvoiceDraft[];
}

export async function maalformFor(admin: SupabaseClient, companyId: string): Promise<Maalform> {
  const { data } = await admin.from("companies").select("tone_settings").eq("id", companyId).maybeSingle();
  return (data?.tone_settings as { maalform?: string } | null)?.maalform === "nn" ? "nn" : "nb";
}

/**
 * En akontofaktura er nettopp overført. Ligger det et sluttfakturaforslag på
 * ordren fra før, får det fratrekket med én gang — ellers ville forslaget
 * vært for høyt til noen laget det på nytt. Var det godkjent, trekkes
 * godkjenningen: det som ble godkjent er ikke lenger det som ligger der.
 */
export async function leggFratrekkPaaSluttfaktura(
  admin: SupabaseClient,
  akonto: InvoiceDraft,
  userId: string | null,
): Promise<void> {
  if (!akonto.order_id) return;
  const { data } = await admin
    .from("invoice_drafts")
    .select("*")
    .eq("order_id", akonto.order_id)
    .eq("company_id", akonto.company_id)
    .eq("is_akonto", false)
    .neq("status", "overfort")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const slutt = (data as InvoiceDraft | null) ?? null;
  if (!slutt) return;

  const lines = medFratrekk(slutt.lines, [akonto], await maalformFor(admin, akonto.company_id));
  if (lines === slutt.lines) return;
  const totals = summer(lines);
  const { error } = await admin
    .from("invoice_drafts")
    .update({ lines, totals, status: "utkast", approved_by: null, approved_at: null, transfer_error: null })
    .eq("id", slutt.id);
  if (error) throw new Error(`Kunne ikke legge fratrekket på sluttfakturaen: ${error.message}`);
  await loggFakturaVersjon(admin, {
    draftId: slutt.id,
    source: "redigering",
    snapshot: { lines, totals, invoice_text: slutt.invoice_text },
    previous: { lines: slutt.lines, totals: slutt.totals, invoice_text: slutt.invoice_text },
    userId,
  });
}
