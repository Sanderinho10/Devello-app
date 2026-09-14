"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Fra tilbud til ordre, med ett klikk.
 *
 * Vises bare når selskapet har ordremodulen og tilbudet er bekreftet — før
 * det er det ingenting å opprette ordre av. Finnes ordren allerede, er
 * knappen en lenke: ett tilbud gir én ordre.
 *
 * Har selskapet ikke modulen, rendres ingenting. Tilbud skal fungere helt
 * uten ordre, og en knapp som sier «ikke aktivert» ville bare vært en
 * reklame midt i arbeidsflaten.
 */
export function OpprettOrdre({
  draftId,
  aktiv,
  eksisterande,
  confirmed,
}: {
  draftId: string;
  aktiv: boolean;
  eksisterande: { id: string; order_no: number } | null;
  confirmed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!aktiv || !confirmed) return null;

  async function opprett() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draftId }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette ordre");
      router.push(`/ordre/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad row-between" style={{ marginTop: 18 }}>
      <div>
        <div style={{ fontWeight: 550 }}>
          {eksisterande ? "Ordren er opprettet." : "Har kunden sagt ja?"}
        </div>
        <div className="tiny muted">
          {eksisterande
            ? "Timer, materiell og dokumentasjon føres på ordren."
            : "Ordren får nummer, kunde og tilbudet som grunnlag."}
        </div>
        {error && (
          <div className="tiny" style={{ color: "#a4271b", marginTop: 4 }}>
            {error}
          </div>
        )}
      </div>
      {eksisterande ? (
        <Link className="button secondary" href={`/ordre/${eksisterande.id}`}>
          Ordre #{eksisterande.order_no} →
        </Link>
      ) : (
        <button type="button" className="button" onClick={opprett} disabled={busy}>
          {busy ? "Oppretter…" : "Opprett ordre"}
        </button>
      )}
    </div>
  );
}
