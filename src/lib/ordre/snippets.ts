/**
 * Snippets — det som er rent og kan testes uten nettleser.
 *
 * En snippet settes inn i beskrivelsen på to måter: fra knappen (ved
 * markøren, over det som er markert), eller ved å skrive «#» og et par
 * bokstaver av navnet, som i HubSpot. finnUtloeser() sier om markøren står
 * i et slikt «#søk», og settInn() gir den nye teksten og hvor markøren
 * skal stå etterpå.
 */

export const MAKS_NAVN = 80;
export const MAKS_TEKST = 4000;

export function lesSnippet(body: unknown): { name: string; text: string } | { error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { name?: unknown; text?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!name) return { error: "Gi snippeten et navn." };
  if (name.length > MAKS_NAVN) return { error: `Navnet kan ha høyst ${MAKS_NAVN} tegn.` };
  if (!text) return { error: "Snippeten mangler tekst." };
  if (text.length > MAKS_TEKST) return { error: `Teksten kan ha høyst ${MAKS_TEKST} tegn.` };
  return { name, text };
}

/**
 * Står markøren i et «#søk»? «#» må stå først i teksten eller etter et
 * mellomrom eller linjeskift, og søket er det som står mellom «#» og
 * markøren — uten linjeskift, høyst 30 tegn.
 */
export function finnUtloeser(tekst: string, markor: number): { start: number; q: string } | null {
  const foer = tekst.slice(0, markor);
  const start = foer.lastIndexOf("#");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(foer[start - 1])) return null;
  const q = foer.slice(start + 1);
  if (q.length > 30 || /[\n#]/.test(q)) return null;
  return { start, q };
}

/** Teksten med snippeten satt inn i stedet for [fra, til), og markøren rett etter. */
export function settInn(tekst: string, fra: number, til: number, snippet: string): { tekst: string; markor: number } {
  const a = Math.max(0, Math.min(fra, tekst.length));
  const b = Math.max(a, Math.min(til, tekst.length));
  return { tekst: tekst.slice(0, a) + snippet + tekst.slice(b), markor: a + snippet.length };
}

/** Snippets som passer søket: navnet først, så innholdet. Tomt søk gir alle. */
export function filtrer<T extends { name: string; text: string }>(snippets: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return snippets;
  const iNavn = snippets.filter((x) => x.name.toLowerCase().includes(s));
  const iTekst = snippets.filter((x) => !x.name.toLowerCase().includes(s) && x.text.toLowerCase().includes(s));
  return [...iNavn, ...iTekst];
}
