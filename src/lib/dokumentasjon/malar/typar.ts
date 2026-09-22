/**
 * Maldefinisjonen — data, ikke JSX.
 *
 * En mal er en fil under malar/<fag>/. Den sier hvilke seksjoner og felt
 * skjemaet har, hva som er påkrevd, hva som fylles inn fra ordren, og
 * hvordan dokumentet skal legges i Boligmappa. Motoren (../motor.ts) og
 * PDF-malen (lib/pdf/dokument-template.ts) leser denne formen og vet
 * ingenting om elektro. Rørlegger og tømrer er nye filer, ikke ny kode.
 */

export type Prefill =
  | "company.name"
  | "company.org_nr"
  | "company.address"
  | "order.customer_name"
  | "order.site_address"
  | "order.order_no"
  | "order.title"
  | "order.description"
  | "today"
  | "user.name";

interface FeltBase {
  key: string;
  label: string;
  required?: boolean;
  help?: string;
}

export type Felt =
  | (FeltBase & {
      type: "text" | "textarea" | "date" | "number";
      unit?: string;
      prefill?: Prefill;
      /** Standardtekst når ingenting er fylt inn fra før — ikke fra ordren. */
      standard?: string;
    })
  | (FeltBase & { type: "checkbox" })
  | (FeltBase & { type: "select"; options: { value: string; label: string }[] })
  /** OK / Avvik / Ikke aktuelt — for kontrollpunkt. */
  | (FeltBase & { type: "check3" })
  /** Måleverdi med kravet i klartekst ved siden av. */
  | (FeltBase & { type: "measure"; unit: string; limit?: string });

export type Check3 = "ok" | "avvik" | "ia";

export interface Seksjon {
  key: string;
  title: string;
  help?: string;
  fields: Felt[];
  /** Tabell: seksjonen gjentas som rader (kursfortegnelse, utstyrsliste). */
  repeat?: { minRows: number; addLabel: string };
}

export interface Mal {
  /** 'elektro.sluttkontroll' */
  key: string;
  version: number;
  fag: string;
  /** «Rapport fra sluttkontroll» */
  title: string;
  /** «FEL § 12, NEK 400» — vist på PDF-en. */
  lovgrunnlag: string;
  /** Kort forklaring til montøren, vist under tittelen. */
  beskrivelse?: string;
  /** Slås opp mot Boligmappas /types ved sending. */
  boligmappa: { chapterTagName: string; documentTypeName: string };
  sections: Seksjon[];
  signature: { required: boolean; label: string };
}

/** Feltverdiene. Repeat-seksjoner lagres som liste av rader under seksjonsnøkkelen. */
export type Feltverdi = string | number | boolean | null;
export type DokumentData = Record<string, Feltverdi | Record<string, Feltverdi>[]>;

export interface PrefillKontekst {
  company: { name: string; org_nr: string | null; address: string | null };
  order: {
    order_no: number;
    title: string;
    description: string | null;
    customer_name: string;
    site_address: string | null;
  };
  user: { name: string };
  /** YYYY-MM-DD. */
  today: string;
}
