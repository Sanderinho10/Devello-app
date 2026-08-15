export type QuoteType = "punktpris" | "fastpris" | "tid_og_materiell";

export type PriceItemKind = "punktpris" | "materiell" | "time";

export type LeadStatus = "ny" | "utkast_klar" | "bekrefta";

/** Hvor henvendelsen kom fra. Manuelle er skrevet inn etter en telefon. */
export type LeadSource = "epost" | "manuell";

export const QUOTE_TYPE_LABELS: Record<QuoteType, string> = {
  punktpris: "Punktpris",
  fastpris: "Fastpris",
  tid_og_materiell: "Tid og materiell",
};

export const QUOTE_TYPE_HELP: Record<QuoteType, string> = {
  punktpris:
    "Hver post har én buntet pris som inkluderer arbeid og materiell. Gir PDF.",
  fastpris:
    "Materiell og timer listes hver for seg, summert til én total. Gir PDF.",
  tid_og_materiell:
    "Løpende regning — timepris + materiell etter forbruk. Bare tekst, ingen PDF.",
};

/** Tilbudstyper som produserer et dokument (og dermed PDF). */
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
 * En navngitt prisliste av én type. En kunde kan ha flere lister per type —
 * for eksempel én punktprisliste for privatkunder og én for næring.
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
  /** Listen raden hører til. Radens type må være lik listens. */
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
    "Buntede priser der arbeid og materiell er samlet i én post. Brukes i punktpristilbud.",
  materiell:
    "Materiellposter med enhetspris. Brukes i materielldelen av et fastpristilbud.",
  time: "Timepriser og faste tillegg. Brukes i arbeidsdelen av fastpris, og i tid og materiell.",
};

/** Hvilke listetyper en tilbudstype henter fra. */
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
  source: LeadSource;
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
 * Strukturert dokumentinnhold for punktpris og fastpris.
 * Dette er kilden for PDF-genereringen — Devellos faste mal leser denne formen.
 */
export interface QuoteDocument {
  /** Kundeinfo, hentet fra leadet og redigerbart i forhåndsvisningen. */
  customer: {
    name: string;
    contact: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  /** Kort tittel på jobben, for eksempel «Elektrisk arbeid — kjellerstue». */
  title: string;
  /** Innledende avsnitt i dokumentet. */
  intro: string;
  sections: QuoteSection[];
  /**
   * Hva som kommer i tillegg hvis jobben krever mer materiell eller tid enn
   * spesifisert. Dette er hele poenget med å spesifisere på fastpris.
   */
  assumptions: string[];
  /** Gyldig til-dato, ISO. */
  valid_until: string | null;
  /** Alle beløp er eks. mva. Mva-sats i prosent. */
  vat_rate: number;
}

export interface QuoteSection {
  /** For punktpris er det typisk én seksjon. For fastpris: «Materiell» og «Arbeid». */
  title: string;
  lines: QuoteLine[];
}

export interface QuoteLine {
  /** Peker tilbake til price_list_items når raden kom derfra. */
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
 * Summeringen skjer her, ikke i modellen. Agenten slår opp priser — den regner
 * aldri selv, så alle summer i UI og PDF kommer fra denne funksjonen.
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
