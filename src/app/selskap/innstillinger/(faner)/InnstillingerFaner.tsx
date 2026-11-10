"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { aktivFane, type InnstillingsGruppe } from "../faner";

/**
 * Menyen til venstre, som i Go: gruppene som overskrifter, valgt punkt med
 * pil mot innholdet. På mobil blir den en rad man sveiper i.
 */
export function InnstillingerMeny({ grupper }: { grupper: InnstillingsGruppe[] }) {
  const pathname = usePathname();
  const aktiv = aktivFane(grupper, pathname);

  return (
    <nav className="inst-meny" aria-label="Innstillinger">
      {grupper.map((g) => (
        <div key={g.label} className="inst-meny-gruppe">
          <div className="inst-meny-tittel">{g.label}</div>
          {g.faner.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`kontakt-fane${f === aktiv ? " aktiv" : ""}`}
              aria-current={f === aktiv ? "page" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Overskriften på sida: navnet på punktet og én setning om hva det er. */
export function InnstillingerTittel({ grupper }: { grupper: InnstillingsGruppe[] }) {
  const pathname = usePathname();
  const aktiv = aktivFane(grupper, pathname);
  if (!aktiv) return null;
  // Underside (en prisliste): den har egen overskrift.
  if (pathname !== aktiv.href) return null;
  return (
    <div className="inst-tittel">
      <h2>{aktiv.label}</h2>
      <p className="muted">{aktiv.beskrivelse}</p>
    </div>
  );
}
