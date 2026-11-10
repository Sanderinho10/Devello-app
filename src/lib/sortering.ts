/**
 * Sortering av lister via adressa: ?sort=navn&retning=synkende.
 *
 * Sorteringa står i URL-en, så ei sortert liste kan lenkast til og overlever
 * at sida lastar på nytt. Berre kolonnar lista sjølv har sagt ja til, blir
 * godtekne — resten fell tilbake til standarden.
 */
export type Sortering<K extends string> = { kolonne: K; stigende: boolean };

export function lesSortering<K extends string>(
  sp: { sort?: string; retning?: string },
  lovlege: readonly K[],
  standard: Sortering<K>,
): Sortering<K> {
  const kolonne = lovlege.find((k) => k === sp.sort);
  if (!kolonne) return standard;
  return { kolonne, stigende: sp.retning !== "synkende" };
}

/**
 * Adressa for å sortere på `kolonne`. Klikk på kolonna som alt er valt, snur
 * retninga; ei ny kolonne startar stigande.
 */
export function sorteringsLenke<K extends string>(
  sti: string,
  params: Record<string, string | undefined>,
  gjeldande: Sortering<K>,
  kolonne: K,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const stigende = gjeldande.kolonne === kolonne ? !gjeldande.stigende : true;
  p.set("sort", kolonne);
  if (!stigende) p.set("retning", "synkende");
  return `${sti}?${p.toString()}`;
}
