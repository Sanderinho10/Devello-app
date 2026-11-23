/**
 * «Solheimslien 26B, 5054 Bergen» → gate «Solheimslien», husnummer «26»,
 * bokstav «B», postnummer «5054», sted «Bergen». Komma og punktum er bare
 * skilletegn. Fire siffer er et postnummer når husnummeret alt er funnet,
 * eller når det er det eneste tallet i søket — husnummer over 999 finnes
 * knapt. Ord etter første tall regnes som sted.
 */
export function tolkSok(q: string): {
  gate: string;
  husnummer: string | null;
  bokstav: string | null;
  postnummer: string | null;
  sted: string | null;
} {
  const ord = q.split(/[\s,;.]+/).filter(Boolean);
  const antallTal = ord.filter((o) => /^\d{1,4}[A-Za-zÆØÅæøå]?$/.test(o)).length;
  const gateOrd: string[] = [];
  const stedOrd: string[] = [];
  let husnummer: string | null = null;
  let bokstav: string | null = null;
  let postnummer: string | null = null;
  for (const o of ord) {
    if (/^\d{4}$/.test(o) && postnummer === null && (husnummer !== null || antallTal === 1)) {
      postnummer = o;
      continue;
    }
    const m = /^(\d{1,4})([A-Za-zÆØÅæøå]?)$/.exec(o);
    if (m && husnummer === null && postnummer === null) {
      husnummer = m[1];
      bokstav = m[2] ? m[2].toUpperCase() : null;
      continue;
    }
    (husnummer === null && postnummer === null ? gateOrd : stedOrd).push(o);
  }
  return { gate: gateOrd.join(" "), husnummer, bokstav, postnummer, sted: stedOrd.length ? stedOrd.join(" ") : null };
}
