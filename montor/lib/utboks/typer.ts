/**
 * Utboksen: alt montøren skriver mens dekningen er borte. Radene ligger i
 * SQLite (db.ts), planleggeren (planlegg.ts) velger neste, motoren
 * (motor.ts) sender.
 */

export type UtboksType = "time" | "materiell" | "notat" | "bilete" | "status";

export type UtboksStatus = "venter" | "sender" | "feil";

export interface UtboksRad {
  id: number;
  /** UUID v4 laget ved oppretting. Nøkkelen serveren dedupliserer på. */
  client_id: string;
  ordre_id: string;
  type: UtboksType;
  /** JSON av payload-typen under. */
  payload: string;
  /** Lokal fil (bilde) som skal lastes opp. */
  fil_sti: string | null;
  /** For bilder: client_id til notatet bildet hører til. */
  avhengig_av: string | null;
  status: UtboksStatus;
  /** Siste feilmelding — vises under Meg. */
  feil: string | null;
  forsok: number;
  /** ISO-tidsstempel for opprettelsen. Sendes i denne rekkefølgen. */
  laga_kl: string;
  /** Tidligste neste forsøk etter backoff. Null = nå. */
  neste_forsok_kl: string | null;
  /** ID-en serveren ga raden. Satt rett før raden slettes. */
  server_id: string | null;
}

export interface TimePayload {
  work_date: string;
  price_item_id: string;
  hours: number;
  note: string | null;
  /** Bare for visning før sending. */
  time_type_name: string;
  unit_price: number;
}

export interface MateriellPayload {
  supplier_item_id: string | null;
  name: string;
  unit: string;
  quantity: number;
  cost_price: number | null;
  sale_price: number | null;
  note: string | null;
  /** Bare for visning før sending. */
  item_no: string | null;
  supplier_name: string | null;
}

export interface NotatPayload {
  text: string;
}

export interface BiletePayload {
  title: string;
  file_name: string;
  mime: string;
  /** Fylles inn av motoren når notatet er sendt. */
  note_id: string | null;
}

export interface StatusPayload {
  status: "paagaar" | "ferdig";
}

export type Payload = TimePayload | MateriellPayload | NotatPayload | BiletePayload | StatusPayload;

/** Det motoren ser av et svar — nok til å bestemme neste steg. */
export type Svar =
  | { slag: "nett" }
  | { slag: "http"; status: number; melding: string | null; server_id: string | null };

/** Det planleggeren bestemmer for en rad etter et svar. */
export type Vedtak =
  | { handling: "ferdig"; server_id: string | null }
  | { handling: "venter"; forsok: number; neste_forsok_kl: string; feil: string | null }
  | { handling: "feil"; feil: string }
  | { handling: "refresh" };
