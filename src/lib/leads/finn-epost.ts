/**
 * Finner en e-postadresse i fritekst.
 *
 * Manuelle henvendelser skrives inn etter en telefon, og e-postfeltet er
 * valgfritt. I praksis limer folk hele henvendelsen inn i beskrivelsen — med
 * adressen midt i teksten — og lar feltet stå tomt. Da satt vi igjen med et
 * tilbud vi ikke visste hvor skulle, selv om adressen sto rett foran oss.
 *
 * Første treff vinner. En henvendelse har som regel én adresse, og gjetter vi
 * feil, står den like fullt i et felt brukeren ser og kan rette.
 */
const EPOST = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/;

export function finnEpost(tekst: string | null | undefined): string | null {
  if (!tekst) return null;
  const treff = tekst.match(EPOST);
  return treff ? treff[0].toLowerCase() : null;
}
