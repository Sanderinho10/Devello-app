/**
 * Finner ordrenummeret i det grossisten skrev på fakturaen.
 *
 * Montøren skriver ordrenummeret på bestillingen, og grossisten sender det
 * tilbake et sted i fakturaen — som regel i OrderReference, men også som
 * «Ordre 1042 Kari Nordmann» i BuyerReference, som «D1042» i en merknad,
 * eller i kontaktnavnet. Vi leter etter alle tall på 4–6 siffer (aldri sju:
 * det er elnumre) og beholder dem som faktisk er et ordrenummer hos
 * selskapet.
 *
 * Kandidatene kommer i prioritert rekkefølge. Den første kandidaten som
 * inneholder minst ett gyldig nummer, avgjør: nøyaktig ett → treff; flere
 * ulike → tvetydig, og da gjetter vi ikke. Et feil treff gir materiell på
 * feil ordre og en feil faktura til kunden; et manglende treff gir én linje
 * i «Ukoblet» som noen fikser på ti sekunder.
 */
export function finnOrdrenummer(
  kandidatar: (string | null | undefined)[],
  gyldige: Set<number>,
): number | null {
  for (const kandidat of kandidatar) {
    if (!kandidat) continue;
    const treff = new Set<number>();
    for (const m of kandidat.matchAll(/(?<!\d)\d{4,6}(?!\d)/g)) {
      const n = Number(m[0]);
      if (gyldige.has(n)) treff.add(n);
    }
    if (treff.size === 1) return [...treff][0];
    if (treff.size > 1) return null;
  }
  return null;
}
