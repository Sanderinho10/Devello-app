import { useSyncExternalStore } from "react";
import { lagret } from "./haptikk";

/**
 * Kvitteringen som står øverst et øyeblikk når noe er lagret: «7,5 t lagret».
 * Én om gangen; en ny erstatter den som står.
 */
let gjeldende: { tekst: string; nr: number } | null = null;
let teller = 0;
let tidsur: ReturnType<typeof setTimeout> | null = null;
const lyttere = new Set<() => void>();

export function kvitter(tekst: string) {
  gjeldende = { tekst, nr: ++teller };
  lagret();
  for (const l of lyttere) l();
  if (tidsur) clearTimeout(tidsur);
  tidsur = setTimeout(() => {
    gjeldende = null;
    for (const l of lyttere) l();
  }, 2200);
}

function abonner(l: () => void) {
  lyttere.add(l);
  return () => {
    lyttere.delete(l);
  };
}

export function useKvittering() {
  return useSyncExternalStore(abonner, () => gjeldende, () => gjeldende);
}
