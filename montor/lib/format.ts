/**
 * Formatering for skjermene: tall med komma, «7,5 t», «kr 12,40», og datoer
 * som «i dag», «i går», «12. sep». Rene funksjoner — testet i format.test.ts.
 */

const MAANEDER = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

/** 12.5 → «12,5». Fjerner overflødige nuller: 2 → «2», 2.50 → «2,5». */
export function tall(n: number, maksDesimaler = 2): string {
  if (!Number.isFinite(n)) return "–";
  const avrundet = Math.round(n * 10 ** maksDesimaler) / 10 ** maksDesimaler;
  return String(avrundet).replace(".", ",");
}

/** Alltid to desimaler: 12.4 → «12,40». */
export function tallFast(n: number, desimaler = 2): string {
  if (!Number.isFinite(n)) return "–";
  return n.toFixed(desimaler).replace(".", ",");
}

/** 7.5 → «7,5 t». */
export function timer(n: number): string {
  return `${tall(n, 2)} t`;
}

/** 12.4 → «kr 12,40». Med enhet: «kr 12,40/m». */
export function kroner(n: number, perEnhet?: string): string {
  const s = `kr ${tallFast(n)}`;
  return perEnhet ? `${s}/${perEnhet}` : s;
}

/** «50 m», «3 stk». */
export function mengde(n: number, enhet: string): string {
  return `${tall(n, 3)} ${enhet}`;
}

/** Lokal dato som YYYY-MM-DD (ikke UTC — montøren fører for sin egen dag). */
export function isoDato(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dag = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dag}`;
}

/** YYYY-MM-DD → lokal Date ved midnatt. Null når strengen ikke er en dato. */
export function fraIsoDato(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sammeDag(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** «12. sep», eller «12. sep 2025» når året er et annet enn nå. */
export function kortDato(d: Date, naa: Date = new Date()): string {
  const s = `${d.getDate()}. ${MAANEDER[d.getMonth()]}`;
  return d.getFullYear() === naa.getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

/**
 * Datoen slik montøren tenker på den: «i dag», «i går», ellers «12. sep».
 * Tar YYYY-MM-DD eller et tidsstempel.
 */
export function dato(verdi: string | Date, naa: Date = new Date()): string {
  const d = verdi instanceof Date ? verdi : (fraIsoDato(verdi) ?? new Date(verdi));
  if (Number.isNaN(d.getTime())) return "";
  if (sammeDag(d, naa)) return "i dag";
  const igaar = new Date(naa);
  igaar.setDate(naa.getDate() - 1);
  if (sammeDag(d, igaar)) return "i går";
  return kortDato(d, naa);
}

/** «i dag 14:32», «12. sep 09:05». For notater og utboksen. */
export function tid(iso: string, naa: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dato(d, naa)} ${hh}:${mm}`;
}

/** «Kari Nordmann» → «Kari N.» når plassen er trang. */
export function kortNavn(navn: string): string {
  const deler = navn.trim().split(/\s+/);
  if (deler.length < 2) return navn.trim();
  return `${deler[0]} ${deler[deler.length - 1][0]}.`;
}

/** Tekst fra et tallfelt: «7,5» og «7.5» begge → 7.5. Null når det ikke er et tall. */
export function lesTall(tekst: string): number | null {
  const s = tekst.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
