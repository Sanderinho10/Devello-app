export type QuoteType = "punktpris" | "fastpris" | "tid_og_materiell";

export type PriceItemKind = "punktpris" | "materiell" | "time";

export type LeadStatus = "ny" | "utkast_klar" | "bekrefta";

export const QUOTE_TYPE_LABELS: Record<QuoteType, string> = {
  punktpris: "Punktpris",
  fastpris: "Fastpris",
  tid_og_materiell: "Tid og materiell",
};

export const QUOTE_TYPE_HELP: Record<QuoteType, string> = {
  punktpris:
    "Kvar post har éin bunta pris som inkluderer arbeid og materiell. Gir PDF.",
  fastpris:
    "Materiell og timar listast kvar for seg, summert til éin total. Gir PDF.",
  tid_og_materiell:
    "Løpande regning — timepris + materiell etter forbruk. Berre tekst, ingen PDF.",
};

/** Tilbudstypar som produserer eit dokument (og dermed PDF). */
export function hasDocument(type: QuoteType): boolean {
  return type === "punktpris" || type === "fastpris";
}

export interface Company {
  id: string;
  name: string;
  org_nr: string | null;
  tone_settings: ToneSettings;
}

export interface ToneSettings {
  /** "du" eller "de" — styrer tiltaleform i e-postteksten. */
  formalitet?: "du" | "de";
  signatur?: string;
  tillegg?: string;
}

export interface CompanyBrand {
  company_id: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  website: string | null;
  footer_note: string | null;
}

/**
 * Ei namngjeven prisliste av éin type. Ein kunde kan ha fleire lister per type
 * — t.d. ei punktprisliste for privatkundar og ei for næring.
 */
export interface PriceList {
  id: string;
  company_id: string;
  kind: PriceItemKind;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

export interface PriceListItem {
  id: string;
  company_id: string;
  /** Lista raden høyrer til. Raden sin type må vere lik lista sin. */
  price_list_id: string;
  kind: PriceItemKind;
  code: string | null;
  name: string;
  description: string | null;
  unit: string;
  unit_price: number;
  includes_labour: boolean;
  includes_material: boolean;
  active: boolean;
}

export const PRICE_KIND_LABELS: Record<PriceItemKind, string> = {
  punktpris: "Punktprisliste",
  materiell: "Materielliste",
  time: "Timeprisliste",
};

export const PRICE_KIND_HELP: Record<PriceItemKind, string> = {
  punktpris:
    "Bunta prisar der arbeid og materiell er samla i éin post. Brukt i punktpristilbod.",
  materiell:
    "Materiellpostar med einingspris. Brukt i materielldelen av eit fastpristilbod.",
  time: "Timeprisar og faste tillegg. Brukt i arbeidsdelen av fastpris, og i tid og materiell.",
};

/** Kva listetypar ein tilbudstype hentar frå. */
export function kindsForQuoteType(type: QuoteType): PriceItemKind[] {
  if (type === "punktpris") return ["punktpris"];
  if (type === "fastpris") return ["materiell", "time"];
  return ["time"];
}

export interface ReferenceQuote {
  id: string;
  company_id: string;
  title: string;
  type: QuoteType;
  job_description: string | null;
  file_name: string | null;
  storage_path: string | null;
  extracted_text: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  company_id: string;
  mailbox_connection_id: string | null;
  external_message_id: string;
  conversation_id: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  body_preview: string | null;
  body_text: string | null;
  received_at: string | null;
  status: LeadStatus;
  created_at: string;
}

/**
 * Strukturert dokumentinnhald for punktpris og fastpris.
 * Dette er kjelda for PDF-genereringa — Devello sin faste mal les denne forma.
 */
export interface QuoteDocument {
  /** Kundeinfo, henta frå leadet og redigerbart i forhandsvisninga. */
  customer: {
    name: string;
    contact: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  /** Kort tittel på jobben, t.d. "Elektrisk arbeid — kjellarstove". */
  title: string;
  /** Innleiande avsnitt i dokumentet. */
  intro: string;
  sections: QuoteSection[];
  /**
   * Kva som kjem i tillegg dersom jobben krev meir materiell eller tid enn
   * spesifisert. Dette er heile poenget med å spesifisere på fastpris.
   */
  assumptions: string[];
  /** Gyldig til-dato, ISO. */
  valid_until: string | null;
  /** Alle beløp er eks. mva. Mva-sats i prosent. */
  vat_rate: number;
}

export interface QuoteSection {
  /** For punktpris er det typisk éin seksjon. For fastpris: "Materiell" og "Arbeid". */
  title: string;
  lines: QuoteLine[];
}

export interface QuoteLine {
  /** Peikar tilbake til price_list_items når raden kom derifrå. */
  price_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export interface Draft {
  id: string;
  lead_id: string;
  quote_type: QuoteType;
  classification_note: string | null;
  email_subject: string;
  email_body: string;
  document: QuoteDocument | null;
  pdf_path: string | null;
  outlook_draft_id: string | null;
  outlook_web_link: string | null;
  confirmed_at: string | null;
}

export interface QuoteTotals {
  lines: number;
  subtotal: number;
  vat: number;
  total: number;
}

/**
 * Summering skjer her, ikkje i modellen. Agenten slår opp prisar — den reknar aldri
 * sjølv, så alle summar i UI og PDF kjem frå denne funksjonen.
 */
export function computeTotals(doc: QuoteDocument): QuoteTotals {
  let subtotal = 0;
  let lines = 0;
  for (const section of doc.sections) {
    for (const line of section.lines) {
      subtotal += line.quantity * line.unit_price;
      lines += 1;
    }
  }
  const vat = subtotal * (doc.vat_rate / 100);
  return {
    lines,
    subtotal: round2(subtotal),
    vat: round2(vat),
    total: round2(subtotal + vat),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatNok(amount: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
