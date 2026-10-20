import Link from "next/link";
import { sorteringsLenke, type Sortering } from "@/lib/sortering";

/**
 * Kolonneoverskrift som sorterer lista, som i Go: klikk for å sortere, klikk
 * igjen for å snu. Pila viser kva lista er sortert på no.
 */
export function SortKolonne<K extends string>({
  kolonne,
  sortering,
  sti,
  params,
  className,
  children,
}: {
  kolonne: K;
  sortering: Sortering<K>;
  sti: string;
  /** Resten av adressa som skal følgje med, som fane og søk. */
  params: Record<string, string | undefined>;
  className?: string;
  children: React.ReactNode;
}) {
  const aktiv = sortering.kolonne === kolonne;
  return (
    <th
      className={className}
      aria-sort={aktiv ? (sortering.stigende ? "ascending" : "descending") : undefined}
    >
      <Link className={`sort-kolonne${aktiv ? " aktiv" : ""}`} href={sorteringsLenke(sti, params, sortering, kolonne)}>
        {children}
        <span className="sort-pil" aria-hidden>
          {aktiv ? (sortering.stigende ? "▲" : "▼") : "▲"}
        </span>
      </Link>
    </th>
  );
}
