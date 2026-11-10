/**
 * Tid i kalenderen. Reine funksjonar utan database, så dei kan testast
 * (npm run test:kalender) og brukast både i nettlesaren og på tenaren.
 *
 * Alt her reknar i lokal tid — nettlesaren si tidssone. Datoar ut og inn
 * av skjema er «YYYY-MM-DD» og klokkeslett «HH:MM», som <input type=date>
 * og <input type=time> gir.
 */

export type HendingType = "oppdrag" | "mote" | "fravaer" | "annet";

export const HENDING_TYPAR: HendingType[] = ["oppdrag", "mote", "fravaer", "annet"];

export const HENDING_NAMN: Record<HendingType, string> = {
  oppdrag: "Oppdrag",
  mote: "Møte",
  fravaer: "Fravær",
  annet: "Annet",
};

export function erHendingType(v: unknown): v is HendingType {
  return typeof v === "string" && (HENDING_TYPAR as string[]).includes(v);
}

const DAG_MS = 24 * 60 * 60 * 1000;

/** Midnatt same dag, lokal tid. */
export function startPaaDag(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Måndagen i veka datoen ligg i, midnatt. */
export function mandag(d: Date): Date {
  const dag = startPaaDag(d);
  const ukedag = (dag.getDay() + 6) % 7; // måndag = 0
  return leggTilDagar(dag, -ukedag);
}

/** n dagar fram (eller tilbake). Held klokka fast over sommartid. */
export function leggTilDagar(d: Date, n: number): Date {
  const ny = new Date(d);
  ny.setDate(ny.getDate() + n);
  return ny;
}

/** «2026-11-09» i lokal tid. */
export function isoDato(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** «10:00» i lokal tid. */
export function klokke(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Dato og klokkeslett frå skjemaet til eit tidspunkt. Null når noko manglar eller er feil. */
export function fraSkjema(dato: string, tid = "00:00"): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato) || !/^\d{2}:\d{2}$/.test(tid)) return null;
  const [y, m, d] = dato.split("-").map(Number);
  const [h, min] = tid.split(":").map(Number);
  if (h > 23 || min > 59) return null;
  const t = new Date(y, m - 1, d, h, min);
  // 2026-02-31 blir 3. mars i JS — det skal ikkje sleppe gjennom.
  if (t.getFullYear() !== y || t.getMonth() !== m - 1 || t.getDate() !== d) return null;
  return t;
}

/** ISO 8601-vekenummer. */
export function vekenummer(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const ukedag = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - ukedag); // torsdagen i veka avgjer året
  const aarStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - aarStart.getTime()) / DAG_MS + 1) / 7);
}

/** Overlappar to tidsrom? Eit som sluttar 10:00 og eit som startar 10:00 gjer ikkje det. */
export function overlappar(a: { start: Date; slutt: Date }, b: { start: Date; slutt: Date }): boolean {
  return a.start < b.slutt && b.start < a.slutt;
}

export interface Tidsrom {
  id: string;
  start: Date;
  slutt: Date;
}

/**
 * Delen av tidsrommet som fell på dagen, eller null. Ein avtale over
 * fleire dagar blir ein bit per dag.
 */
export function bitPaaDag<T extends Tidsrom>(h: T, dag: Date): (T & { fraKl: Date; tilKl: Date }) | null {
  const dagStart = startPaaDag(dag);
  const dagSlutt = leggTilDagar(dagStart, 1);
  if (!overlappar(h, { start: dagStart, slutt: dagSlutt })) return null;
  return {
    ...h,
    fraKl: h.start > dagStart ? h.start : dagStart,
    tilKl: h.slutt < dagSlutt ? h.slutt : dagSlutt,
  };
}

/**
 * Avtalar som overlappar kvarandre på same dag, side om side.
 *
 * Grupper av avtalar som heng saman (direkte eller via ein tredje) deler
 * breidda likt. Inne i gruppa får kvar avtale den første kolonnen som er
 * ledig når han startar — same grep som Google og Outlook.
 */
export function plasserSideOmSide<T extends { id: string; fraKl: Date; tilKl: Date }>(
  bitar: T[],
): Map<string, { kolonne: number; kolonnar: number }> {
  const sortert = [...bitar].sort(
    (a, b) => a.fraKl.getTime() - b.fraKl.getTime() || b.tilKl.getTime() - a.tilKl.getTime(),
  );
  const ut = new Map<string, { kolonne: number; kolonnar: number }>();

  let gruppe: { id: string; kolonne: number }[] = [];
  let kolonneSlutt: number[] = [];
  let gruppeSlutt = -Infinity;

  const lukkGruppe = () => {
    for (const g of gruppe) ut.set(g.id, { kolonne: g.kolonne, kolonnar: kolonneSlutt.length });
    gruppe = [];
    kolonneSlutt = [];
  };

  for (const b of sortert) {
    const start = b.fraKl.getTime();
    const slutt = b.tilKl.getTime();
    if (start >= gruppeSlutt) lukkGruppe();
    let kolonne = kolonneSlutt.findIndex((s) => s <= start);
    if (kolonne === -1) {
      kolonne = kolonneSlutt.length;
      kolonneSlutt.push(slutt);
    } else {
      kolonneSlutt[kolonne] = slutt;
    }
    gruppe.push({ id: b.id, kolonne });
    gruppeSlutt = Math.max(gruppeSlutt, slutt);
  }
  lukkGruppe();
  return ut;
}

/** «10:00–15:00», «Hele dagen», eller med datoar når avtalen går over fleire dagar. */
export function tidTekst(h: { start: Date; slutt: Date; heileDagen: boolean }): string {
  const dato = (d: Date) =>
    new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(d);
  if (h.heileDagen) {
    const sisteDag = leggTilDagar(h.slutt, -1);
    return isoDato(sisteDag) === isoDato(h.start) ? "Hele dagen" : `${dato(h.start)} – ${dato(sisteDag)}`;
  }
  if (isoDato(h.start) === isoDato(h.slutt) || (klokke(h.slutt) === "00:00" && isoDato(leggTilDagar(h.slutt, -1)) === isoDato(h.start))) {
    return `${klokke(h.start)}–${klokke(h.slutt) === "00:00" ? "24:00" : klokke(h.slutt)}`;
  }
  return `${dato(h.start)} ${klokke(h.start)} – ${dato(h.slutt)} ${klokke(h.slutt)}`;
}
