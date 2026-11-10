/**
 * Norsk tid på tenaren. Tenaren køyrer i UTC, men ein arbeidsdag i Noreg
 * startar 23:00 eller 22:00 UTC dagen før, avhengig av sommartid. Desse
 * funksjonane gir grensene utan å stole på tidssona til maskina.
 */

const TZ = "Europe/Oslo";

/** Kor mange minutt Oslo er føre UTC på tidspunktet (60 eller 120). */
function forskyving(ms: number): number {
  const del = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const somUtc = Date.UTC(Number(del.year), Number(del.month) - 1, Number(del.day), Number(del.hour), Number(del.minute));
  return Math.round((somUtc - Math.floor(ms / 60_000) * 60_000) / 60_000);
}

/** Midnatt norsk tid den dagen, som tidspunkt. */
export function osloMidnatt(dato: string): Date {
  const [y, m, d] = dato.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  let t = utc - forskyving(utc) * 60_000;
  // Rett opp om sommartida skiftar mellom gjetninga og svaret.
  t = utc - forskyving(t) * 60_000;
  return new Date(t);
}

/** [start, slutt) for dagen i norsk tid. Slutt er midnatt dagen etter. */
export function osloDag(dato: string): { start: Date; slutt: Date } {
  const [y, m, d] = dato.split("-").map(Number);
  const neste = new Date(Date.UTC(y, m - 1, d + 1));
  const nesteDato = neste.toISOString().slice(0, 10);
  return { start: osloMidnatt(dato), slutt: osloMidnatt(nesteDato) };
}

/** «2026-11-09» for tidspunktet, i norsk tid. */
export function osloDato(t: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/** Datoane frå og med `fra` til og med `til`. */
export function datoarMellom(fra: string, til: string): string[] {
  const ut: string[] = [];
  const [y, m, d] = fra.split("-").map(Number);
  for (let i = 0; i < 400; i++) {
    const dato = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (dato > til) break;
    ut.push(dato);
  }
  return ut;
}

/** n dagar fram frå datoen. */
export function pluss(dato: string, n: number): string {
  const [y, m, d] = dato.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
