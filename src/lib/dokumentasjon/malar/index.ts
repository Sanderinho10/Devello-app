import { ELEKTRO } from "./elektro/index";
import type { Mal } from "./typar";

/**
 * Malene per fag. Et nytt fag er en mappe med en index.ts som eksporterer
 * lista si, pluss én linje her. En ny mal i et fag som finnes er én fil,
 * lagt til i fagets index.ts — ingenting annet i koden endres.
 */
const PER_FAG: Record<string, Mal[]> = {
  elektro: ELEKTRO,
};

/** Malene for et fag. Ukjent fag faller tilbake på elektro, som resten av appen. */
export function malarForFag(fag: string | null | undefined): Mal[] {
  const key = (fag ?? "elektro").trim().toLowerCase() || "elektro";
  return PER_FAG[key] ?? PER_FAG.elektro;
}

export function finnMal(key: string): Mal | null {
  for (const liste of Object.values(PER_FAG)) {
    const m = liste.find((x) => x.key === key);
    if (m) return m;
  }
  return null;
}

export function alleMalar(): Mal[] {
  return Object.values(PER_FAG).flat();
}
