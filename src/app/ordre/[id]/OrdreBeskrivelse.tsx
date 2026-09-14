"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Arbeidsbeskrivelsen — det montøren leser først.
 *
 * Agenten skriver et første utkast når ordren kommer fra et tilbud. Det er
 * et utkast: hintet under sier hvem som skrev det, og forsvinner så snart
 * et menneske har lagret sin egen versjon.
 */
export function OrdreBeskrivelse({
  orderId,
  description,
  source,
}: {
  orderId: string;
  description: string | null;
  source: "ai" | "manuell" | null;
}) {
  const router = useRouter();
  const [tekst, setTekst] = useState(description ?? "");
  const [lagret, setLagret] = useState(description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = tekst.trim() !== lagret.trim();

  async function lagre() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: tekst }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(tekst);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Beskrivelse
        </span>
        {endret && (
          <button type="button" className="button" onClick={lagre} disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      <textarea
        className="textarea"
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        placeholder="Skriv kort hva jobben går ut på."
        style={{ minHeight: 110 }}
      />
      {source === "ai" && !endret && (
        <span className="hint">
          Skrevet av agenten ut fra henvendelsen og tilbudet — rediger fritt.
        </span>
      )}
    </div>
  );
}
