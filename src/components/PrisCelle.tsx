"use client";

import { useEffect, useState } from "react";
import { formatNok } from "@/lib/types";

/**
 * Enhetsprisen som et felt man kan skrive rett i.
 *
 * En prisfil er ikke noe man importerer én gang og lar ligge. Kobber går opp,
 * timeprisen justeres til nyttår, en post var feil fra starten. Å måtte
 * eksportere, rette i Excel og importere på nytt for én rad er nettopp den
 * omveien som gjør at prisfilen blir stående utdatert.
 *
 * Lagrer på Enter og når feltet mister fokus — men bare hvis tallet er
 * endret. Esc setter tilbake. Feltet ser ut som tall til man er innom det
 * med musa, så listen leser som en liste og ikke som et skjema.
 */
export function PrisCelle({
  id,
  pris,
  onLagra,
}: {
  id: string;
  pris: number;
  /** Kalles etter vellykket lagring, så lista kan hentes på nytt. */
  onLagra?: () => void;
}) {
  const [verdi, setVerdi] = useState(String(pris));
  const [tilstand, setTilstand] = useState<"ro" | "lagrer" | "lagra" | "feil">("ro");
  const [feil, setFeil] = useState<string | null>(null);

  // Kommer det en ny pris utenfra (lista er hentet på nytt), følger feltet
  // med — men ikke mens noen står og skriver i det.
  useEffect(() => {
    setVerdi(String(pris));
  }, [pris]);

  async function lagre() {
    const ny = Number(verdi);
    if (!Number.isFinite(ny) || ny < 0) {
      setVerdi(String(pris));
      return;
    }
    if (ny === pris) return;

    setTilstand("lagrer");
    setFeil(null);
    try {
      const res = await fetch("/api/price-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, unit_price: ny }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre prisen");
      setTilstand("lagra");
      onLagra?.();
      // «Lagret» skal bekrefte, ikke bli stående.
      setTimeout(() => setTilstand((t) => (t === "lagra" ? "ro" : t)), 1600);
    } catch (err) {
      setTilstand("feil");
      setFeil(err instanceof Error ? err.message : String(err));
      setVerdi(String(pris));
    }
  }

  return (
    <span className="pris-celle">
      <input
        className="cell-input num"
        type="number"
        min="0"
        step="1"
        inputMode="decimal"
        aria-label="Enhetspris eks. mva"
        title={`${formatNok(pris)} — klikk for å endre`}
        value={verdi}
        disabled={tilstand === "lagrer"}
        onChange={(e) => setVerdi(e.target.value)}
        onBlur={lagre}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setVerdi(String(pris));
            e.currentTarget.blur();
          }
        }}
      />
      <span className={`pris-celle-status ${tilstand}`} aria-live="polite">
        {tilstand === "lagrer" && "Lagrer…"}
        {tilstand === "lagra" && "Lagret"}
        {tilstand === "feil" && (feil ?? "Feilet")}
      </span>
    </span>
  );
}
