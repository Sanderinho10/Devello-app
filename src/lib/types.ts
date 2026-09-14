export type QuoteType = "punktpris" | "fastpris" | "tid_og_materiell";

export type PriceItemKind = "punktpris" | "materiell" | "time";

/**
 * bekrefta = utkastet er ferdig og PDF-en laget; kladden ligger i Outlook
 * eller venter på å bli sendt manuelt. Kan fortsatt endres.
 * sendt    = mennesket har sagt at tilbudet er ute hos kunden. Låst.
 */
export type LeadStatus = "ny" | "genererer" | "utkast_klar" | "bekrefta" | "sendt";

/** Hvor henvendelsen kom fra. Manuelle er skrevet inn etter en telefon. */
export type LeadSource = "epost" | "manuell";

/** Hvor mye vekt utkastet tåler. Se lib/drafts/confidence.ts. */
export type QuoteConfidence = "hoeg" | "middels" | "laag";

export const CONFIDENCE_LABELS: Record<QuoteConfidence, string> = {
  hoeg: "Godt grunnlag",
  middels: "Les nøye",
  laag: "Svakt grunnlag",
};

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

/** Vi starter med to: admin styrer selskapet, standard bruker agentene. */
export type UserRole = "admin" | "standard";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  standard: "Standard",
};

export interface Company {
  id: string;
  name: string;
  org_nr: string | null;
  tone_settings: ToneSettings;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  /** Én måned gratis fra registrering. */
  trial_ends_at: string | null;
  /** Partnerkoden som vervet kunden, om noen gjorde det. */
  partner_code: string | null;
  /**
   * Motoren selskapet kjører tilbudsagenten på. null = standarden
   * (MOTOR_DEFAULT, ellers v2). Se lib/claude/motor.ts.
   */
  motor_versjon: "v2" | "v3" | null;
  /** Faget — velger bransjepakken i v3. null = elektro. */
  fag: string | null;
  /**
   * Modulene selskapet har: «tilbud», «ordre». Styrer sidemeny og
   * API-tilgang. Se lib/moduler.ts.
   */
  moduler: string[];
  /** Neste ledige ordrenummer. Deles ut av neste_ordrenummer() i databasen. */
  next_order_no: number;
  /** Standardpåslag på materiell i prosent. Kopieres inn på hver materiellinje. */
  materials_markup_pct: number;
}

export interface Member {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface ToneSettings {
  /** Målform for all kundevendt tekst: bokmål eller nynorsk. */
  maalform?: "nb" | "nn";
  signatur?: string;
  tillegg?: string;
}

export const MAALFORM_LABELS: Record<"nb" | "nn", string> = {
  nb: "Bokmål",
  nn: "Nynorsk",
};

export interface CompanyBrand {
  company_id: string;
  logo_path: string | null;
  /** Bildet nederst i e-postsignaturen. Sendes som inline-vedlegg. */
  signature_image_path: string | null;
  primary_color: string;
  accent_color: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  /** Hvorfor en bakgrunnsgenerering feilet. Null når alt gikk bra. */
  generation_error: string | null;
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
  /**
   * Satt når noen har overstyrt prisen i utkastet.
   *
   * Prisen kommer normalt fra prisfilen — modellen peker på en rad, koden
   * slår opp beløpet. Overstyringen er en menneskelig avgjørelse for denne
   * ene jobben, og markeres så det er synlig i redigeringen at raden ikke
   * lenger følger prisfilen.
   */
  unit_price_manual?: boolean;
  /**
   * Rabatt på raden, i prosent av linjesummen. Utelatt eller 0 = ingen.
   *
   * Som overstyrt pris er dette en menneskelig avgjørelse for den ene jobben,
   * og går aldri inn i agentens kontekst. Rabattkolonnen vises i tilbudet
   * bare når minst én rad faktisk har rabatt — se harRabatt.
   */
  discount_pct?: number;
}

/** utkast = vanlig tilbud. trenger_avklaring = jobben var for ukjent til å prise. */
export type DraftAgentStatus = "utkast" | "trenger_avklaring";

export interface Draft {
  id: string;
  lead_id: string;
  quote_type: QuoteType;
  /** Agentens begrunnelse for typevalget, forankret i referansene. */
  typebegrunnelse: string | null;
  agent_status: DraftAgentStatus;
  /** Agentens beskjeder til brukeren. Den kan ikke spørre — dette er kanalen. */
  merknader: string[];
  /** Poster kunden ba om som ikke fantes i noen aktiv prisliste. */
  ikke_funnet: string[];
  /** Kun tid og materiell: estimert spenn i timer. */
  estimat_timer: { fra: number; til: number } | null;
  confidence: QuoteConfidence;
  /** Én linje per signal bak vurderingen. */
  confidence_note: string | null;
  email_subject: string;
  email_body: string;
  document: QuoteDocument | null;
  pdf_path: string | null;
  outlook_draft_id: string | null;
  outlook_web_link: string | null;
  confirmed_at: string | null;
  /** Satt når tilbudet er sendt. Låser utkastet for redigering. */
  sent_at: string | null;
  /** Motoren som laget utkastet. null for utkast fra før v3. */
  motor_versjon: "v2" | "v3" | null;
  /**
   * Bare v3: omfanget fra steg 1 — jobbtype, kundetype, arbeidsposter,
   * antakelser og spørsmål til kunden. Formen er lib/claude/generate-v3 Omfang.
   */
  omfang: DraftOmfang | null;
}

export interface DraftOmfang {
  jobbtype: string;
  kundetype: "forbruker" | "bedrift" | "ukjent";
  status: DraftAgentStatus;
  arbeidsposter: {
    kva: string;
    sitat: string;
    mengde: number | null;
    enhet: string;
    kilde: "lead" | "antakelse" | "sjekkliste";
    inkludert: "ja" | "nei" | "ikke_relevant";
    begrunnelse: string | null;
  }[];
  antakelser: string[];
  sporsmal_til_kunden: string[];
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
      subtotal += lineTotal(line);
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

/** Rabatten på en rad, klemt til 0–100. Alt annet er ingen rabatt. */
export function lineDiscount(line: QuoteLine): number {
  const pct = Number(line.discount_pct ?? 0);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(100, pct);
}

/** Linjesummen etter rabatt. Én kilde til beløpet, i UI og PDF. */
export function lineTotal(line: QuoteLine): number {
  return line.quantity * line.unit_price * (1 - lineDiscount(line) / 100);
}

/**
 * Har minst én rad rabatt? Styrer om rabattkolonnen kommer med i det hele
 * tatt: et tilbud uten rabatt skal ikke ha en tom kolonne som antyder at det
 * var noe å forhandle om.
 */
export function harRabatt(doc: QuoteDocument): boolean {
  return doc.sections.some((s) => s.lines.some((l) => lineDiscount(l) > 0));
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

// ---------------------------------------------------------------------------
// Ordre
// ---------------------------------------------------------------------------

/**
 * opna      = opprettet, ingen har begynt.
 * paagaar   = jobben er i gang.
 * ferdig    = arbeidet er gjort, ikke fakturert.
 * fakturert = settes av fakturasteget senere; kan ikke settes for hånd ennå.
 * avbrutt   = jobben ble ikke noe av. Kan settes fra alle andre tilstander.
 */
export type OrderStatus = "opna" | "paagaar" | "ferdig" | "fakturert" | "avbrutt";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  opna: "Åpen",
  paagaar: "Pågår",
  ferdig: "Ferdig",
  fakturert: "Fakturert",
  avbrutt: "Avbrutt",
};

/** Statusene som er en jobb i arbeid. Resten er avsluttet. */
export const ORDER_ACTIVE_STATUSES: OrderStatus[] = ["opna", "paagaar"];

/**
 * Tilbudet slik det var da ordren ble opprettet. Tilbudet kan redigeres
 * videre i tilbudsmodulen; ordren skal vise det kunden faktisk sa ja til.
 */
export interface OrderQuoteSnapshot {
  quote_type: QuoteType;
  document: QuoteDocument | null;
  totals: QuoteTotals | null;
}

export interface Order {
  id: string;
  company_id: string;
  /** Løpenummer per selskap, fra 1000. Nummeret montøren skriver på bestillingen. */
  order_no: number;
  status: OrderStatus;
  title: string;
  /** Kort arbeidsbeskrivelse. Null når ingen har skrevet noe. */
  description: string | null;
  /** Hvem som skrev beskrivelsen: agenten eller et menneske. */
  description_source: "ai" | "manuell" | null;
  customer_name: string;
  customer_contact: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  /** Adressen der jobben gjøres. */
  site_address: string | null;
  /** Hvor ordren kom fra. Begge null for en ordre uten tilbud. */
  lead_id: string | null;
  draft_id: string | null;
  quote_type: QuoteType | null;
  quote_snapshot: OrderQuoteSnapshot | null;
  /** Planlagt sum eks. mva fra snapshotet. Null for tid og materiell. */
  planned_total: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  /** 'oppretta' | 'status' | 'redigert' — timer og faktura får egne senere. */
  kind: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Grossistkatalog
// ---------------------------------------------------------------------------

/** En grossist selskapet handler hos: Onninen, Ahlsell, Solar … */
export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  /** Vårt kundenummer hos grossisten. */
  customer_no: string | null;
  /** Grossistens organisasjonsnummer, fra varefila. */
  seller_id: string | null;
  active: boolean;
  last_import_at: string | null;
  last_import_status: "ok" | "feil" | null;
  last_import_note: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * En vare i grossistkatalogen. Prisene appen bruker er per måleenhet
 * (list_price_per_unit, net_price_per_unit); list_price og
 * qty_per_price_unit er slik fila sa det, for sporbarhet.
 */
export interface SupplierItem {
  id: string;
  company_id: string;
  supplier_id: string;
  /** 0 ukjent, 1 elnr, 2 EAN, 3 fabrikant, 4 NRF, 9 tillegg. */
  item_kind: number;
  item_no: string;
  name: string;
  /** stk, m, l, kg. */
  unit: string;
  price_unit: string | null;
  qty_per_price_unit: number;
  list_price: number;
  list_price_per_unit: number;
  discount_group: string | null;
  discount_pct: number | null;
  net_price_per_unit: number | null;
  brand: string | null;
  product_type: string | null;
  stocked: boolean | null;
  sales_pack: number | null;
  block_no: string | null;
  gtin: string | null;
  active: boolean;
  price_date: string | null;
  imported_at: string;
}

// ---------------------------------------------------------------------------
// Timer og materiell på ordren
// ---------------------------------------------------------------------------

/** En timeføring. Navn og pris er kopiert fra timeprislista da den ble ført. */
export interface TimeEntry {
  id: string;
  company_id: string;
  order_id: string;
  /** Montøren timene gjelder. */
  user_id: string;
  /** YYYY-MM-DD. */
  work_date: string;
  price_item_id: string | null;
  time_type_name: string;
  unit_price: number;
  hours: number;
  note: string | null;
  billable: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** manuell = ført i appen. faktura og pakkseddel kommer fra POGO i steg 3. */
export type MaterialSource = "manuell" | "faktura" | "pakkseddel";

/**
 * En materiellinje. Alt er kopiert inn i det den føres: linjen skal stå
 * selv om katalogen endres. sale_price = cost_price × (1 + markup_pct/100)
 * når kostprisen er kjent.
 */
export interface MaterialEntry {
  id: string;
  company_id: string;
  order_id: string;
  source: MaterialSource;
  supplier_item_id: string | null;
  item_no: string | null;
  name: string;
  unit: string;
  quantity: number;
  /** Kostpris per enhet eks. mva. Null for fritekst uten kostpris. */
  cost_price: number | null;
  markup_pct: number;
  /** Salgspris per enhet eks. mva. */
  sale_price: number;
  note: string | null;
  billable: boolean;
  registered_by: string | null;
  registered_at: string;
  updated_at: string;
}
