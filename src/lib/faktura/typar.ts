/**
 * Formene i fakturaforslaget.
 *
 * To lag, med vilje:
 *
 *   FakturaPlan  — det modellen svarer med. Struktur, tekst og kilder.
 *                  Skjemaet har ikke ett eneste tallfelt: modellen kan
 *                  ikke skrive et beløp selv om den ville.
 *   InvoiceLine  — det som ligger i invoice_drafts.lines. Beløpene er
 *                  regnet av koden (lib/faktura/resolver.ts) fra kildene
 *                  planen peker på.
 */

export type LineKind = "tilbod_seksjon" | "tilbod_linje" | "timer" | "materiell" | "tekst";

export type SourceType = "quote_section" | "quote_line" | "time_entry" | "material_entry";

/** En linje slik agenten foreslår den: kilder og ord, ingen tall. */
export interface PlanLine {
  kind: LineKind;
  /** Id-ene fra konteksten. Tom bare for tekstlinjer. */
  source_ids: string[];
  description: string;
  included: boolean;
  reason: string | null;
}

export interface FakturaPlan {
  strategy: "fastpris" | "fastpris_med_tillegg" | "tid_og_materiell";
  /** Det som faktureres iht. tilbudet, eller alt ved tid og materiell. */
  lines: PlanLine[];
  /** Tillegg utover tilbudet. Tom ved tid og materiell. */
  extras: PlanLine[];
  notes: string[];
  questions: string[];
  invoice_text: string;
}

export interface InvoiceSource {
  type: SourceType;
  id: string;
}

/** En linje på fakturaen. Alle beløp eks. mva, regnet av koden. */
export interface InvoiceLine {
  id: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unit: string;
  /** Null for en tekstlinje — den har ingen pris og teller ikke i summen. */
  unit_price: number | null;
  /** Satt når et menneske har overstyrt prisen. Da følger den ikke kilden lenger. */
  unit_price_manual?: boolean;
  line_total: number;
  vat_pct: number;
  included: boolean;
  sources: InvoiceSource[];
  ai_reason: string | null;
}

export interface InvoiceTotals {
  subtotal: number;
  vat: number;
  total: number;
}

/** Kildene planen kan peke på, slik konteksten ga dem til modellen. */
export interface QuoteLineSource {
  /** «s1-l2»: seksjon 1, linje 2. Stabil så lenge snapshotet er det. */
  id: string;
  section_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
}

export interface QuoteSectionSource {
  /** «s1». */
  id: string;
  title: string;
  lines: QuoteLineSource[];
}

export interface TimeSource {
  id: string;
  work_date: string;
  user_name: string;
  time_type_name: string;
  unit_price: number;
  hours: number;
  note: string | null;
  billable: boolean;
  /** Alt fakturert på et tidligere utkast. */
  invoiced: boolean;
}

export interface MaterialSource {
  id: string;
  source: "manuell" | "faktura" | "pakkseddel";
  item_no: string | null;
  name: string;
  quantity: number;
  unit: string;
  cost_price: number | null;
  sale_price: number;
  note: string | null;
  billable: boolean;
  replaced: boolean;
  invoiced: boolean;
  /** Fakturanummeret linja kom fra, når den kom fra en leverandørfaktura. */
  invoice_no: string | null;
}

export interface Kjelder {
  quote_type: "punktpris" | "fastpris" | "tid_og_materiell" | null;
  sections: QuoteSectionSource[];
  /** Forutsetningene i tilbudet — det som kommer i tillegg. */
  assumptions?: string[];
  timar: TimeSource[];
  materiell: MaterialSource[];
  vat_pct: number;
}
