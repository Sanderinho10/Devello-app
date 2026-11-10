import Link from "next/link";

/**
 * Søkefeltet til høyre i verktøylinjen. Et vanlig GET-skjema: søket står i
 * adressen (?q=), så det kan deles, og tilbakeknappen virker. Visning og
 * sortering følger med som skjulte felt.
 */
export function Sokefelt({
  q,
  behold,
  nullstill,
  tittel,
  etikett,
  foran,
}: {
  q: string;
  /** Parametre som skal stå når man søker (fane, sortering). */
  behold: Record<string, string | undefined>;
  /** Adressen uten søket. */
  nullstill: string;
  /** Hjelpeteksten: hva søket treffer på. */
  tittel: string;
  etikett: string;
  /** Det som står til venstre for søket, f.eks. «Sist hentet …». */
  foran?: React.ReactNode;
}) {
  return (
    <form method="get" className="verktoylinje-hoyre">
      {Object.entries(behold).map(([navn, verdi]) =>
        verdi ? <input key={navn} type="hidden" name={navn} value={verdi} /> : null,
      )}
      {foran}
      {q && (
        <Link className="button ghost" href={nullstill}>
          Nullstill
        </Link>
      )}
      <input
        className="input"
        type="search"
        name="q"
        defaultValue={q}
        placeholder="Søk"
        title={tittel}
        aria-label={etikett}
      />
    </form>
  );
}
