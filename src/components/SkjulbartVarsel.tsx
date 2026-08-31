"use client";

import { useState } from "react";

/**
 * Et varsel man kan ta til etterretning.
 *
 * «Koble til en Microsoft 365-postkasse» er riktig og nyttig én gang. For den
 * som har valgt å jobbe med manuelle henvendelser, er den en oransje stripe
 * øverst på siden de bruker mest, hver dag, om noe de allerede har bestemt
 * seg for. Da slutter folk å lese oransje striper — også den ene gangen det
 * haster.
 *
 * Krympet, ikke fjernet. Trekanten står igjen og åpner varselet med ett klikk,
 * for det kommer en dag da svaret er et annet.
 */
export function SkjulbartVarsel({
  id,
  skjult,
  tone = "warning",
  children,
}: {
  /** Stabil id. Ligger i users.skjulte_varsel — endres den, kommer varselet tilbake. */
  id: string;
  skjult: boolean;
  tone?: "warning" | "info" | "error";
  children: React.ReactNode;
}) {
  const [krympet, setKrympet] = useState(skjult);
  // Åpnet fra trekanten. Endrer ikke valget — lukker man igjen, er det
  // fortsatt krympet neste gang.
  const [aapnetIgjen, setAapnetIgjen] = useState(false);

  async function lagre(skjul: boolean) {
    try {
      await fetch("/api/varsel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, skjul }),
      });
    } catch {
      // Valget gjelder i denne økten uansett. At det ikke ble husket til neste
      // gang er ikke verdt en feilmelding oppå det varselet man nettopp
      // prøvde å bli kvitt.
    }
  }

  if (krympet && !aapnetIgjen) {
    return (
      <button
        type="button"
        className={`varsel-krympet ${tone}`}
        onClick={() => setAapnetIgjen(true)}
        title="Vis varselet"
        aria-label="Vis varselet"
      >
        ⚠
      </button>
    );
  }

  return (
    <div className={`banner ${tone} varsel-rad`}>
      <div>{children}</div>
      <button
        type="button"
        className="varsel-lukk"
        onClick={() => {
          setAapnetIgjen(false);
          if (!krympet) {
            setKrympet(true);
            void lagre(true);
          }
        }}
        title="Krymp varselet"
        aria-label="Krymp varselet"
      >
        ✕
      </button>
    </div>
  );
}
