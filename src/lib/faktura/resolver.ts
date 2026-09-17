import { randomUUID } from "node:crypto";
import type {
  FakturaPlan,
  InvoiceLine,
  InvoiceSource,
  InvoiceTotals,
  Kjelder,
  LineKind,
  PlanLine,
} from "./typar";

/**
 * Fra plan til linjer — der beløpene blir til.
 *
 * Modellen har pekt på kilder. Her slås de opp, og hver linje får mengde,
 * enhet og pris fra kilden: seksjonens sum, tilbudslinjen som den er, timer
 * gruppert per type og sats, materiell til salgspris. Modellen har ingen
 * stemme i tallene; har den pekt feil, kommer det tilbake som `problems`,
 * og den får én runde til.
 *
 * Ren funksjon uten database, så den kan prøves (scripts/test-faktura.ts)
 * og så API-et kan regne om linjer etter redigering med samme regler.
 */

export interface ResolverResultat {
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  problems: string[];
}

const SOURCE_TYPE_FOR_KIND: Record<LineKind, InvoiceSource["type"] | null> = {
  tilbod_seksjon: "quote_section",
  tilbod_linje: "quote_line",
  timer: "time_entry",
  materiell: "material_entry",
  tekst: null,
};

export function planTilLinjer(plan: FakturaPlan, kjelder: Kjelder): ResolverResultat {
  const problems: string[] = [];
  const lines: InvoiceLine[] = [];
  const brukt = new Map<string, "lines" | "extras">();

  // Strategien må passe grunnlaget. Uten tilbud finnes det bare tid og
  // materiell; med tid-og-materiell-tilbud likeså.
  const harFastpris = kjelder.sections.length > 0 && kjelder.quote_type !== "tid_og_materiell";
  if (!harFastpris && plan.strategy !== "tid_og_materiell") {
    problems.push(
      `strategi «${plan.strategy}» krever et punktpris- eller fastpristilbud på ordren. Denne ordren faktureres etter tid og materiell.`,
    );
  }
  if (plan.strategy === "tid_og_materiell" && plan.extras.length > 0) {
    problems.push("ved tid og materiell skal extras være tom — alt hører hjemme i lines.");
  }

  const sektAvId = new Map(kjelder.sections.map((s) => [s.id, s]));
  const linjeAvId = new Map(kjelder.sections.flatMap((s) => s.lines.map((l) => [l.id, l] as const)));
  const timeAvId = new Map(kjelder.timar.map((t) => [t.id, t]));
  const matAvId = new Map(kjelder.materiell.map((m) => [m.id, m]));

  const alle: { linje: PlanLine; gruppe: "lines" | "extras"; nr: number }[] = [
    ...plan.lines.map((linje, i) => ({ linje, gruppe: "lines" as const, nr: i + 1 })),
    ...plan.extras.map((linje, i) => ({ linje, gruppe: "extras" as const, nr: i + 1 })),
  ];

  for (const { linje, gruppe, nr } of alle) {
    const hvor = `${gruppe}[${nr}] («${linje.description.slice(0, 40)}»)`;
    const ids = [...new Set((linje.source_ids ?? []).map((s) => String(s).trim()).filter(Boolean))];

    if (linje.kind === "tekst") {
      if (ids.length) problems.push(`${hvor}: en tekstlinje skal ikke ha kilder.`);
      lines.push(tekstlinje(linje, kjelder.vat_pct));
      continue;
    }
    if (ids.length === 0) {
      problems.push(`${hvor}: linjen mangler kilder. Bare tekstlinjer kan stå uten.`);
      continue;
    }

    // Én kilde, én linje. Samme id to steder er dobbeltfakturering.
    let dublett = false;
    for (const id of ids) {
      const foer = brukt.get(id);
      if (foer) {
        problems.push(`${hvor}: kilden ${id} er alt brukt i ${foer}. Én kilde hører hjemme i én linje.`);
        dublett = true;
      }
      brukt.set(id, gruppe);
    }
    if (dublett) continue;

    if (linje.kind === "tilbod_seksjon") {
      let sum = 0;
      let ok = true;
      const titler: string[] = [];
      for (const id of ids) {
        const s = sektAvId.get(id);
        if (!s) {
          problems.push(`${hvor}: fant ingen tilbudsseksjon med id ${id}.`);
          ok = false;
          continue;
        }
        sum += s.lines.reduce((acc, l) => acc + linjesum(l.quantity, l.unit_price, l.discount_pct), 0);
        titler.push(s.title);
      }
      if (!ok) continue;
      lines.push(
        lag(linje, {
          quantity: 1,
          unit: "stk",
          unit_price: round2(sum),
          description: linje.description || titler.join(", "),
          sources: ids.map((id) => ({ type: "quote_section" as const, id })),
          vat: kjelder.vat_pct,
        }),
      );
      continue;
    }

    if (linje.kind === "tilbod_linje") {
      const treff = ids.map((id) => ({ id, l: linjeAvId.get(id) }));
      const manglar = treff.filter((t) => !t.l);
      for (const m of manglar) problems.push(`${hvor}: fant ingen tilbudslinje med id ${m.id}.`);
      if (manglar.length) continue;
      for (const { id, l } of treff) {
        const q = l!.quantity;
        // Rabatt bakes inn i enhetsprisen: fakturaen har ingen rabattkolonne,
        // og kunden skal se prisen de faktisk betaler.
        const pris = q > 0 ? round2(linjesum(q, l!.unit_price, l!.discount_pct) / q) : 0;
        lines.push(
          lag(linje, {
            quantity: q,
            unit: l!.unit,
            unit_price: pris,
            description: treff.length === 1 && linje.description ? linje.description : l!.description,
            sources: [{ type: "quote_line", id }],
            vat: kjelder.vat_pct,
          }),
        );
      }
      continue;
    }

    if (linje.kind === "timer") {
      const grupper = new Map<string, { type: string; sats: number; timar: number; ids: string[] }>();
      let ok = true;
      for (const id of ids) {
        const t = timeAvId.get(id);
        if (!t) {
          problems.push(`${hvor}: fant ingen timeføring med id ${id}.`);
          ok = false;
          continue;
        }
        if (t.invoiced) {
          problems.push(`${hvor}: timeføringen ${id} er alt fakturert.`);
          ok = false;
          continue;
        }
        if (!t.billable) {
          problems.push(`${hvor}: timeføringen ${id} er merket ikke fakturerbar.`);
          ok = false;
          continue;
        }
        const key = `${t.time_type_name}|${t.unit_price}`;
        const g = grupper.get(key) ?? { type: t.time_type_name, sats: t.unit_price, timar: 0, ids: [] };
        g.timar += t.hours;
        g.ids.push(id);
        grupper.set(key, g);
      }
      if (!ok) continue;
      const fleire = grupper.size > 1;
      for (const g of grupper.values()) {
        lines.push(
          lag(linje, {
            quantity: round2(g.timar),
            unit: "t",
            unit_price: round2(g.sats),
            description: fleire ? `${linje.description || "Arbeid"}: ${g.type}` : linje.description || g.type,
            sources: g.ids.map((id) => ({ type: "time_entry" as const, id })),
            vat: kjelder.vat_pct,
          }),
        );
      }
      continue;
    }

    if (linje.kind === "materiell") {
      const treff = ids.map((id) => ({ id, m: matAvId.get(id) }));
      let ok = true;
      for (const { id, m } of treff) {
        if (!m) {
          problems.push(`${hvor}: fant ingen materiell-linje med id ${id}.`);
          ok = false;
        } else if (m.invoiced) {
          problems.push(`${hvor}: materiell-linja ${id} er alt fakturert.`);
          ok = false;
        } else if (m.replaced) {
          problems.push(`${hvor}: materiell-linja ${id} er erstattet av en leverandørfaktura og skal ikke faktureres.`);
          ok = false;
        } else if (!m.billable) {
          problems.push(`${hvor}: materiell-linja ${id} er merket ikke fakturerbar.`);
          ok = false;
        }
      }
      if (!ok) continue;
      for (const { id, m } of treff) {
        lines.push(
          lag(linje, {
            quantity: m!.quantity,
            unit: m!.unit,
            unit_price: round2(m!.sale_price),
            description: treff.length === 1 && linje.description ? linje.description : m!.name,
            sources: [{ type: "material_entry", id }],
            vat: kjelder.vat_pct,
          }),
        );
      }
      continue;
    }

    problems.push(`${hvor}: ukjent linjetype «${String(linje.kind)}».`);
  }

  // Kildetypen skal stemme med linjetypen — en timeføring-id på en
  // materiell-linje er en feil, ikke en tolkning.
  for (const l of lines) {
    const ventet = SOURCE_TYPE_FOR_KIND[l.kind];
    if (ventet && l.sources.some((s) => s.type !== ventet)) {
      problems.push(`linjen «${l.description}» har kilder av feil type for ${l.kind}.`);
    }
  }

  return { lines, totals: summer(lines), problems };
}

// ---------------------------------------------------------------------------
// Omregning etter redigering
// ---------------------------------------------------------------------------

/**
 * Linjene slik brukeren sendte dem tilbake, regnet om med samme regler.
 * Prisen og mengden er det brukeren sa; summene er våre. En endret pris
 * mot forrige versjon merkes manuell.
 */
export function reknOmLinjer(
  linjer: InvoiceLine[],
  forrige: InvoiceLine[] = [],
): { lines: InvoiceLine[]; totals: InvoiceTotals } {
  const foer = new Map(forrige.map((l) => [l.id, l]));
  const lines = linjer.map((l) => {
    const gammal = foer.get(l.id);
    const pris = l.unit_price === null ? null : round2(Number(l.unit_price));
    const manuell =
      Boolean(l.unit_price_manual) ||
      (gammal !== undefined && pris !== (gammal.unit_price === null ? null : round2(Number(gammal.unit_price))));
    const q = round3(Number(l.quantity) || 0);
    return {
      ...l,
      quantity: q,
      unit_price: pris,
      unit_price_manual: manuell || undefined,
      line_total: pris === null ? 0 : round2(q * pris),
      included: Boolean(l.included),
    };
  });
  return { lines, totals: summer(lines) };
}

export function summer(lines: InvoiceLine[]): InvoiceTotals {
  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    if (!l.included || l.unit_price === null) continue;
    subtotal += l.line_total;
    vat += l.line_total * (l.vat_pct / 100);
  }
  return { subtotal: round2(subtotal), vat: round2(vat), total: round2(subtotal + vat) };
}

// ---------------------------------------------------------------------------

function lag(
  plan: PlanLine,
  v: {
    quantity: number;
    unit: string;
    unit_price: number;
    description: string;
    sources: InvoiceSource[];
    vat: number;
  },
): InvoiceLine {
  return {
    id: randomUUID(),
    kind: plan.kind,
    description: v.description.trim(),
    quantity: v.quantity,
    unit: v.unit,
    unit_price: v.unit_price,
    line_total: round2(v.quantity * v.unit_price),
    vat_pct: v.vat,
    included: plan.included !== false,
    sources: v.sources,
    ai_reason: plan.reason?.trim() || null,
  };
}

function tekstlinje(plan: PlanLine, vat: number): InvoiceLine {
  return {
    id: randomUUID(),
    kind: "tekst",
    description: plan.description.trim(),
    quantity: 0,
    unit: "",
    unit_price: null,
    line_total: 0,
    vat_pct: vat,
    included: plan.included !== false,
    sources: [],
    ai_reason: plan.reason?.trim() || null,
  };
}

/** Samme formel som lineTotal i lib/types: mengde × pris × (1 − rabatt). */
function linjesum(q: number, pris: number, rabatt: number): number {
  const pct = Number.isFinite(rabatt) && rabatt > 0 ? Math.min(100, rabatt) : 0;
  return q * pris * (1 - pct / 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
