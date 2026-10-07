/**
 * Løpenummeret i e-posten.
 *
 * Emnet får « – Tilbud 1004» på slutten, foran et eventuelt «(versjon 2)»
 * fra ny-versjon-flyten, så de to leser som «Gulvvarme bad – Tilbud 1004
 * (versjon 2)». Brødteksten får en egen linje nederst. Begge er
 * idempotente: står nummeret der fra før, skjer ingenting, og et gammelt
 * nummer byttes ut i stedet for å legges på en gang til.
 *
 * Rene funksjoner, testet i scripts/test-tilbudsnr.ts.
 */

const EMNE_SUFFIKS = /\s*[–-]\s*Tilbud\s+\d+\s*$/i;
const VERSJON_SUFFIKS = /\s*\(versjon \d+\)\s*$/i;

export function medTilbudsnr(emne: string, nr: number): string {
  const versjon = VERSJON_SUFFIKS.exec(emne)?.[0].trim() ?? "";
  const uten = emne.replace(VERSJON_SUFFIKS, "").replace(EMNE_SUFFIKS, "").trim();
  const base = uten ? `${uten} – Tilbud ${nr}` : `Tilbud ${nr}`;
  return versjon ? `${base} ${versjon}` : base;
}

export function harTilbudsnr(tekst: string, nr: number): boolean {
  return new RegExp(`\\bTilbud(?:snummer|snr\\.?)?\\s*:?\\s*#?${nr}\\b`, "i").test(tekst);
}

export function medTilbudsnrIKropp(kropp: string, nr: number): string {
  if (harTilbudsnr(kropp, nr)) return kropp;
  const uten = kropp.replace(/\n*\s*Tilbudsnummer:\s*\d+\s*$/i, "").trimEnd();
  return `${uten}\n\nTilbudsnummer: ${nr}`;
}
