"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * «Hent leads fra og med» — bare synlig fram til første henting.
 *
 * Standarden er dagen postkassen ble koblet til. De aller fleste vil se på det
 * som kommer inn nå, og en innboks som plutselig fylles med et halvt år gammel
 * post er verre enn en tom liste. Vil de likevel bakover, er det ett felt.
 */
export function FirstFetchFrom({ value }: { value: string }) {
  const router = useRouter();
  const [dato, setDato] = useState(value);
  const [busy, setBusy] = useState(false);
  const [lagret, setLagret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iDag = new Date().toISOString().slice(0, 10);

  async function lagre() {
    setBusy(true);
    setError(null);
    setLagret(false);
    try {
      const res = await fetch("/api/mailbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_fetch_from: dato }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8, marginTop: 14 }}>
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="label">Hent leads fra og med</span>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            className="input"
            type="date"
            max={iDag}
            value={dato}
            onChange={(e) => {
              setDato(e.target.value);
              setLagret(false);
            }}
            style={{ maxWidth: 190 }}
          />
          <button
            type="button"
            className="button secondary"
            onClick={lagre}
            disabled={busy || dato === value}
          >
            {busy ? "Lagrer…" : "Lagre"}
          </button>
          {lagret && <span className="tiny muted">Lagret.</span>}
        </div>
      </label>
      <span className="hint">
        Gjelder bare den aller første hentingen. Etterpå henter knappen bare det
        som har kommet inn siden sist. Velger du langt tilbake, kan det ta noen
        klikk før hele køen er inne.
      </span>
      {error && <div className="banner error">{error}</div>}
    </div>
  );
}
