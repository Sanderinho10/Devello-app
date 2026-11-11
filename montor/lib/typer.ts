/**
 * Typene fra docs/api.md. Feltnavnene er databasens (snake_case) — appen
 * deler dem med nettappen og oversetter ikke.
 */

export type OrderStatus = "opna" | "paagaar" | "ferdig" | "fakturert" | "avbrutt";

export type MaterialSource = "manuell" | "faktura" | "pakkseddel";

export interface Order {
  id: string;
  company_id: string;
  order_no: number;
  status: OrderStatus;
  title: string;
  description: string | null;
  description_source: "ai" | "manuell" | null;
  customer_name: string;
  customer_contact: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  site_address: string | null;
  lead_id: string | null;
  draft_id: string | null;
  quote_type: string | null;
  planned_total: number | null;
  boligmappa_number: string | null;
  boligmappa_property: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface TimeEntry {
  id: string;
  company_id: string;
  order_id: string;
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
  invoice_draft_id: string | null;
  client_id: string | null;
}

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
  cost_price: number | null;
  markup_pct: number;
  sale_price: number;
  note: string | null;
  billable: boolean;
  registered_by: string | null;
  registered_at: string;
  updated_at: string;
  invoice_line_id: string | null;
  replaced_by: string | null;
  invoice_draft_id: string | null;
  client_id: string | null;
}

export interface OrderNote {
  id: string;
  company_id: string;
  order_id: string;
  user_id: string;
  text: string;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Bilde på ordren — order_documents med kind «fil» og bilde-MIME. */
export interface Bilete {
  id: string;
  title: string;
  file_name: string | null;
  created_at: string;
  note_id: string | null;
}

/** GET /api/app/ordrar/{id} */
export interface OrdreIApp {
  ordre: Order;
  timer: (TimeEntry & { user_name: string })[];
  materiell: MaterialEntry[];
  notat: (OrderNote & { user_name: string; bilete: Bilete[] })[];
  bilete: Bilete[];
  lovlege_overgangar: OrderStatus[];
}

/** GET /api/app/ordrar — én rad i lista. */
export interface OrdreIListe {
  id: string;
  order_no: number;
  status: OrderStatus;
  title: string;
  customer_name: string;
  customer_phone: string | null;
  site_address: string | null;
  updated_at: string;
  mine_timar: number;
}

export interface Timetype {
  id: string;
  name: string;
  unit_price: number;
}

/** GET /api/app/meg */
export interface Meg {
  user: { id: string; full_name: string | null; email: string; role: "admin" | "standard" };
  company: { id: string; name: string; materials_markup_pct: number };
  timetyper: Timetype[];
  api_version: number;
}

/** GET /api/grossist/sok — ett treff. */
export interface SokTreff {
  id: string;
  supplier_id: string;
  supplier_name: string;
  item_no: string;
  gtin: string | null;
  name: string;
  unit: string;
  list_price_per_unit: number;
  net_price_per_unit: number | null;
}

/** GET …/dokumenter/{docId}/fil?format=json */
export interface FilLenke {
  url: string;
  expires_in: number;
}

// --- kalender -------------------------------------------------------------

export type HendingType = "oppdrag" | "mote" | "fravaer" | "annet";

export interface KalenderOrdre {
  id: string;
  order_no: number;
  title: string;
  customer_name: string;
  site_address: string | null;
  status: OrderStatus;
}

/** GET /api/app/kalender — én avtale. */
export interface KalenderHending {
  id: string;
  kind: HendingType;
  /** Tittelen slik den skal vises: egen tittel, eller ordretittelen for et oppdrag. */
  title: string;
  egen_tittel: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  /** Midnatt til midnatt norsk tid — vis uten klokkeslett. */
  all_day: boolean;
  /** Satt bare for oppdrag. */
  order: KalenderOrdre | null;
  deltakarar: { id: string; navn: string }[];
}

/** GET /api/app/timeforslag — oppdrag montøren var satt opp på, men ikke har ført timer for. */
export interface Timeforslag {
  user_id: string;
  user_name: string;
  order: { id: string; order_no: number; title: string; customer_name: string };
  work_date: string;
  fra: string;
  til: string;
  timar: number;
  event_ids: string[];
  price_item_id: string | null;
  time_type_name: string | null;
}

// --- varsler --------------------------------------------------------------

export type VarselType = "nytt_oppdrag" | "endra_oppdrag" | "fjerna_oppdrag";

/** GET /api/app/varsel — ett varsel. */
export interface Varsel {
  id: string;
  kind: VarselType | string;
  title: string;
  body: string;
  event_id: string | null;
  order_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface VarselSvar {
  varsel: Varsel[];
  /** Antall uleste — tallet på merket. */
  ulest: number;
}

/** data-feltet i pushen. */
export interface PushData {
  type?: VarselType | string;
  event_id?: string | null;
  order_id?: string | null;
}
