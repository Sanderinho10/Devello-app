import type { Maaling, PrisOverstyring } from "@/lib/evaluering/maaling";

/**
 * Lærdom fra prisoverstyringer.
 *
 * Gullsettet på Star Elektros seks første tilbud viste 100 % dekning, null
 * manglende poster og null omfangsavvik — men åtte prisoverstyringer, fordelt
 * på fire prisrader. Roger rettet altså de samme tallene i hvert eneste
 * tilbud. Det er ikke agenten som tar feil; det er prisfilen. Men i dag ser
 * ingen mønsteret: hver retting er en enkelt håndbevegelse i ett tilbud, og
 * neste tilbud kommer med den samme gale prisen igjen.
 *
 * Denne modulen leser rettingene på tvers av tilbud og sier fra når et mønster
 * er sterkt nok til å foreslå en ny pris — og, like viktig, når det ikke er
 * det. To rettinger som spriker (7 000 og 6 360) er ikke en pris; det er et
 * spørsmål til brukeren.
 *
 * Ren funksjon, ingen database. Kalles fra «npm run gullsett» i dag og fra
 * Prisfil-siden når forslagene skal vises der.
 */

/** Hvor mange rettinger som skal til før vi mener noe i det hele tatt. */
const MINST_ANTALL = 2;

/** Hvor mye de sendte prisene kan spre seg og fortsatt kalles enighet. */
const MAKS_SPRIK = 0.05;

export type Tillit =
  /** Flere rettinger, alle på om lag samme beløp. Trygt å foreslå. */
  | "enige"
  /** Flere rettinger, men de spriker. Brukeren må avgjøre. */
  | "sprikende"
  /** Bare én retting. For lite til å mene noe — vises, men uten forslag. */
  | "enkelt";

export interface Prisforslag {
  price_item_id: string | null;
  /** Navnet slik det sto på posten i tilbudet. */
  post: string;
  /** Det prisfilen sier i dag. Null når raden manglet helt. */
  fila: number;
  /** Beløpene firmaet faktisk sendte, i rekkefølge. */
  sendt: number[];
  antall: number;
  tillit: Tillit;
  /** Prisen vi foreslår. Bare satt når tilliten er «enige». */
  forslag: number | null;
  /** (forslag − fila) / fila. Null når fila er 0 eller raden manglet. */
  endringPct: number | null;
  /** Én setning, klar til å vises i UI-et. */
  tekst: string;
}

/**
 * Grupperer rettingene per prisrad og rangerer dem: det som er rettet oftest,
 * og med størst utslag, først.
 */
export function prisavvik(maalinger: Maaling[]): Prisforslag[] {
  const grupper = new Map<string, PrisOverstyring[]>();
  for (const m of maalinger) {
    for (const o of m.prisoverstyrt) {
      const nokkel = o.price_item_id ?? `tekst:${normaliser(o.post)}`;
      const liste = grupper.get(nokkel);
      if (liste) liste.push(o);
      else grupper.set(nokkel, [o]);
    }
  }

  const forslag: Prisforslag[] = [];
  for (const rettinger of grupper.values()) {
    const sendt = rettinger.map((r) => r.til);
    const fila = rettinger[0].fra;
    const antall = rettinger.length;
    const midt = median(sendt);
    const sprik = midt === 0 ? Infinity : (Math.max(...sendt) - Math.min(...sendt)) / midt;

    const tillit: Tillit =
      antall < MINST_ANTALL ? "enkelt" : sprik <= MAKS_SPRIK ? "enige" : "sprikende";
    const anbefalt = tillit === "enige" ? midt : null;

    forslag.push({
      price_item_id: rettinger[0].price_item_id,
      post: rettinger[0].post,
      fila,
      sendt,
      antall,
      tillit,
      forslag: anbefalt,
      endringPct: anbefalt !== null && fila > 0 ? (anbefalt - fila) / fila : null,
      tekst: setning(rettinger[0].post, fila, sendt, antall, tillit, anbefalt),
    });
  }

  // Mest rettet først; ved likt antall, størst utslag i kroner først.
  return forslag.sort(
    (a, b) => b.antall - a.antall || avstand(b) - avstand(a),
  );
}

function setning(
  post: string,
  fila: number,
  sendt: number[],
  antall: number,
  tillit: Tillit,
  anbefalt: number | null,
): string {
  const ganger = antall === 1 ? "én gang" : `${antall} ganger`;
  if (tillit === "enige" && anbefalt !== null) {
    const retning = anbefalt > fila ? "for lav" : "for høy";
    return `«${post}» er rettet ${ganger}, hver gang til om lag ${kr(anbefalt)}. Prisfila står til ${kr(fila)} — altså ${retning}. Skal raden settes til ${kr(anbefalt)}?`;
  }
  if (tillit === "sprikende") {
    return `«${post}» er rettet ${ganger}, men til ulike beløp (${sendt.map(kr).join(", ")}). Prisfila står til ${kr(fila)}. Her trengs det en avgjørelse — er prisen forskjellig fra jobb til jobb, eller skal raden ha ett tall?`;
  }
  return `«${post}» er rettet ${ganger}, fra ${kr(fila)} til ${kr(sendt[0])}. For lite til å konkludere — kommer den igjen, foreslår vi en ny pris.`;
}

function avstand(f: Prisforslag): number {
  return f.forslag === null ? 0 : Math.abs(f.forslag - f.fila);
}

function median(tall: number[]): number {
  const sortert = [...tall].sort((a, b) => a - b);
  const midt = Math.floor(sortert.length / 2);
  return sortert.length % 2 === 1
    ? sortert[midt]
    : (sortert[midt - 1] + sortert[midt]) / 2;
}

function kr(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}

function normaliser(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}
