import { computeTotals, lineTotal, type QuoteDocument, type QuoteLine, type QuoteType } from "@/lib/types";

/**
 * Målingen bak gullsettet: agentens utkast mot det firmaet faktisk sendte.
 *
 * Ligger for seg selv så den kan testes uten database (scripts/test-gullsett.ts)
 * og brukes av både «npm run gullsett» og, senere, av evalueringssuiten når
 * gullsettsakene skal kjøres om igjen mot en ny motor.
 */

export interface Snapshot {
  quote_type: QuoteType;
  email_subject: string | null;
  email_body: string | null;
  document: QuoteDocument | null;
}

export interface Maaling {
  leadId: string;
  emne: string;
  sendt: string | null;
  endeligFraLogg: boolean;
  aiPoster: number;
  endeligPoster: number;
  aiSum: number;
  endeligSum: number;
  /** Andel av de sendte postene agenten hadde med. */
  dekning: number;
  /** Sendte poster agenten ikke hadde — brukeren måtte legge dem til selv. */
  manglet: string[];
  /** Poster agenten hadde som brukeren tok ut. */
  fjernet: string[];
  /** Samme post, annet beløp: prisfilen var feil eller manglet raden. */
  prisoverstyrt: { post: string; fra: number; til: number }[];
  /** (utkast − sendt) / sendt, rått. */
  avvikPct: number | null;
  /** Samme, men med de sendte prisene på postene agenten traff. */
  omfangsavvikPct: number | null;
  forutsetningerLagtTil: number;
  forutsetningerFjernet: number;
  /** Motoren som laget utkastet (drafts.motor_versjon). Settes av kalleren. */
  motor?: string;
}

export function maal(
  leadId: string,
  emne: string,
  sendt: string | null,
  endeligFraLogg: boolean,
  ai: Snapshot,
  endelig: Snapshot,
): Maaling {
  const aiLinjer = alleLinjer(ai.document);
  const endeligLinjer = alleLinjer(endelig.document);

  // En sendt post regnes som truffet når agenten hadde en post som peker på
  // samme prisrad, eller — for poster uten prisrad — med samme tekst.
  // Beløpet er med vilje ikke en del av matchingen: en prisoverstyring er en
  // menneskelig avgjørelse, ikke et bomskudd fra agenten.
  const brukt = new Set<number>();
  const par: { e: QuoteLine; a: QuoteLine }[] = [];
  const manglet: string[] = [];
  for (const e of endeligLinjer) {
    const i = aiLinjer.findIndex((a, idx) => !brukt.has(idx) && sammePost(a, e));
    if (i === -1) {
      manglet.push(e.description);
    } else {
      brukt.add(i);
      par.push({ e, a: aiLinjer[i] });
    }
  }
  const fjernet = aiLinjer.filter((_, idx) => !brukt.has(idx)).map((a) => a.description);

  const prisoverstyrt = par
    .filter(({ e, a }) => Math.abs(Number(e.unit_price) - Number(a.unit_price)) > 0.005)
    .map(({ e, a }) => ({ post: e.description, fra: Number(a.unit_price), til: Number(e.unit_price) }));

  const aiSum = ai.document ? computeTotals(ai.document).subtotal : 0;
  const endeligSum = endelig.document ? computeTotals(endelig.document).subtotal : 0;

  // Omfangssummen: agentens poster og mengder, men med de sendte prisene der
  // posten ble truffet. Det som blir igjen av avvik er omfang og mengder.
  let omfangSum = 0;
  for (let idx = 0; idx < aiLinjer.length; idx += 1) {
    const a = aiLinjer[idx];
    const treff = par.find((p) => p.a === a);
    omfangSum += treff ? lineTotal({ ...a, unit_price: treff.e.unit_price }) : lineTotal(a);
  }

  const aiForuts = ai.document?.assumptions ?? [];
  const endForuts = endelig.document?.assumptions ?? [];

  return {
    leadId,
    emne,
    sendt,
    endeligFraLogg,
    aiPoster: aiLinjer.length,
    endeligPoster: endeligLinjer.length,
    aiSum,
    endeligSum,
    dekning: endeligLinjer.length === 0 ? 1 : par.length / endeligLinjer.length,
    manglet,
    fjernet,
    prisoverstyrt,
    avvikPct: endeligSum > 0 ? (aiSum - endeligSum) / endeligSum : null,
    omfangsavvikPct: endeligSum > 0 ? (omfangSum - endeligSum) / endeligSum : null,
    forutsetningerLagtTil: endForuts.filter((f) => !aiForuts.includes(f)).length,
    forutsetningerFjernet: aiForuts.filter((f) => !endForuts.includes(f)).length,
  };
}

function alleLinjer(doc: QuoteDocument | null): QuoteLine[] {
  return doc ? doc.sections.flatMap((s) => s.lines) : [];
}

function sammePost(a: QuoteLine, b: QuoteLine): boolean {
  if (a.price_item_id && b.price_item_id) return a.price_item_id === b.price_item_id;
  return normaliser(a.description) === normaliser(b.description);
}

function normaliser(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?«»"']/g, "").trim();
}
