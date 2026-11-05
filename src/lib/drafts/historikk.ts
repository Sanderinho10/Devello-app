import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeTotals,
  lineDiscount,
  type QuoteDocument,
  type QuoteLine,
  type QuoteType,
} from "@/lib/types";

/**
 * Én versjon av tilbudet slik den gikk ut til kunden.
 *
 * Kilden er den endelige raden i draft_versions for hver tilbudsversjon. Den
 * endres aldri etter at den er skrevet, så det som vises her er det kunden
 * fikk — ikke det utkastet har blitt til siden.
 */
export interface SendtVersjon {
  /** Raden i draft_versions. */
  id: string;
  /** Tilbudsversjonen: 1, 2, 3 … */
  revisjon: number;
  /** Når den ble markert som sendt. Null for eldre rader uten tidspunkt. */
  sendtAt: string | null;
  /** Når den ble bekreftet og PDF-en laget. */
  bekreftetAt: string;
  quoteType: QuoteType;
  emailSubject: string | null;
  emailBody: string | null;
  document: QuoteDocument | null;
  /** PDF-en som ble laget for versjonen, i bøtta quote-pdfs. */
  pdfPath: string | null;
  /** Totalsum inkl. mva., når versjonen har et dokument. */
  total: number | null;
}

interface DraftForHistorikk {
  id: string;
  revisjon: number;
  sent_at: string | null;
  forrige_sendt_at: string | null;
  pdf_path: string | null;
}

/**
 * Alle versjoner av tilbudet som er sendt, eldste først.
 *
 * En tilbudsversjon kan bekreftes flere ganger før den sendes — hver gang blir
 * det en ny «endelig»-rad. Den som ble markert som sendt, er den kunden fikk.
 * Eldre rader har ikke sendt_at; da er den siste endelige i versjonen det
 * beste svaret vi har.
 */
export async function hentSendteVersjoner(
  admin: SupabaseClient,
  draft: DraftForHistorikk,
): Promise<SendtVersjon[]> {
  const { data: rader, error } = await admin
    .from("draft_versions")
    .select(
      "id, version, revisjon, sendt_at, created_at, quote_type, email_subject, email_body, document, pdf_path",
    )
    .eq("draft_id", draft.id)
    .eq("source", "endelig")
    .order("version", { ascending: true });
  if (error) throw new Error(error.message);

  // Gjeldende versjon er bare med når den faktisk er sendt. Før det er den
  // et utkast, og utkastet står i editoren.
  const sisteSendte = draft.sent_at ? draft.revisjon : draft.revisjon - 1;

  const perRevisjon = new Map<number, NonNullable<typeof rader>[number]>();
  for (const rad of rader ?? []) {
    if (rad.revisjon > sisteSendte) continue;
    const valgt = perRevisjon.get(rad.revisjon);
    // Rader kommer i stigende rekkefølge, så en senere rad vinner — med
    // mindre den vi har er markert som sendt og den nye ikke er det.
    if (!valgt || rad.sendt_at || !valgt.sendt_at) perRevisjon.set(rad.revisjon, rad);
  }

  return [...perRevisjon.values()]
    .sort((a, b) => a.revisjon - b.revisjon)
    .map((rad) => {
      const document = (rad.document ?? null) as QuoteDocument | null;
      const gjeldende = rad.revisjon === draft.revisjon;
      return {
        id: rad.id,
        revisjon: rad.revisjon,
        // Eldre rader har ikke tidspunktet selv, men utkastet husker det for
        // den gjeldende og den forrige versjonen.
        sendtAt:
          rad.sendt_at ??
          (gjeldende
            ? draft.sent_at
            : rad.revisjon === draft.revisjon - 1
              ? draft.forrige_sendt_at
              : null),
        bekreftetAt: rad.created_at,
        quoteType: rad.quote_type as QuoteType,
        emailSubject: rad.email_subject,
        emailBody: rad.email_body,
        document,
        pdfPath: rad.pdf_path ?? (gjeldende ? draft.pdf_path : null),
        total: document ? computeTotals(document).total : null,
      };
    });
}

/** Hva som er endret i en post fra forrige versjon. */
export type PostEndring =
  | { type: "ny"; linje: QuoteLine }
  | { type: "fjernet"; linje: QuoteLine }
  | { type: "endret"; for: QuoteLine; etter: QuoteLine; felt: string[] };

export interface Versjonsendringer {
  poster: PostEndring[];
  totalFor: number;
  totalEtter: number;
  tittel: { for: string; etter: string } | null;
  forutsetninger: { lagtTil: string[]; fjernet: string[] };
  emne: boolean;
  tekst: boolean;
}

/**
 * Hva som skilte en versjon fra den forrige — det man lurer på når kunden
 * ringer og spør «hva var det dere endret?».
 *
 * Poster matches på prisfil-raden, ellers på beskrivelsen. En post som har
 * fått ny tekst, vises derfor som fjernet og ny. Det er ærlig: for kunden er
 * det også en annen linje.
 */
export function sammenlign(forrige: SendtVersjon, denne: SendtVersjon): Versjonsendringer {
  const a = forrige.document;
  const b = denne.document;

  const poster: PostEndring[] = [];
  if (a && b) {
    const nokkel = (l: QuoteLine) => l.price_item_id ?? `tekst:${l.description.trim().toLowerCase()}`;
    const igjen = new Map<string, QuoteLine[]>();
    for (const l of a.sections.flatMap((s) => s.lines)) {
      const k = nokkel(l);
      igjen.set(k, [...(igjen.get(k) ?? []), l]);
    }
    for (const l of b.sections.flatMap((s) => s.lines)) {
      const kandidater = igjen.get(nokkel(l));
      const gammel = kandidater?.shift();
      if (!gammel) {
        poster.push({ type: "ny", linje: l });
        continue;
      }
      const felt: string[] = [];
      if (gammel.quantity !== l.quantity) felt.push("antall");
      if (gammel.unit_price !== l.unit_price) felt.push("pris");
      if (lineDiscount(gammel) !== lineDiscount(l)) felt.push("rabatt");
      if (gammel.unit !== l.unit) felt.push("enhet");
      if (gammel.description !== l.description) felt.push("tekst");
      if (felt.length) poster.push({ type: "endret", for: gammel, etter: l, felt });
    }
    for (const rest of igjen.values()) {
      for (const l of rest) poster.push({ type: "fjernet", linje: l });
    }
  }

  const forA = new Set(a?.assumptions ?? []);
  const forB = new Set(b?.assumptions ?? []);

  return {
    poster,
    totalFor: forrige.total ?? 0,
    totalEtter: denne.total ?? 0,
    tittel: a && b && a.title !== b.title ? { for: a.title, etter: b.title } : null,
    forutsetninger: {
      lagtTil: [...forB].filter((x) => !forA.has(x)),
      fjernet: [...forA].filter((x) => !forB.has(x)),
    },
    // Emnet får «(versjon n)» lagt på av appen selv. Det er ikke en endring.
    emne: utenVersjon(forrige.emailSubject) !== utenVersjon(denne.emailSubject),
    tekst: (forrige.emailBody ?? "") !== (denne.emailBody ?? ""),
  };
}

function utenVersjon(emne: string | null): string {
  return (emne ?? "").replace(/\s*\(versjon \d+\)\s*$/i, "").trim();
}
