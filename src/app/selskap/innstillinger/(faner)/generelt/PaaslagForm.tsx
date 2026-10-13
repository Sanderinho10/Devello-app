"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Standardpåslaget på materiell.
 *
 * Kopieres inn på hver materiellinje når den legges til, og kan overstyres
 * der. Endres standarden, rører det ikke linjene som alt er ført — de er
 * det montøren faktisk avtalte.
 */
export function PaaslagForm({ paaslag, erAdmin }: { paaslag: number; erAdmin: boolean }) {
  const router = useRouter();
  const [verdi, setVerdi] = useState(String(paaslag));
  const [lagret, setLagret] = useState(String(paaslag));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/order-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_markup_pct: Number(verdi.replace(",", ".")) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(String(payload.materials_markup_pct));
      setVerdi(String(payload.materials_markup_pct));
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad" onSubmit={lagre} style={{ maxWidth: 520 }}>
      {error && <div className="banner error">{error}</div>}
      {ok && <div className="banner success">Lagret.</div>}
      <label className="field">
        <span className="label">Standardpåslag på materiell (%)</span>
        <input
          className="input"
          inputMode="decimal"
          value={verdi}
          onChange={(e) => setVerdi(e.target.value)}
          disabled={!erAdmin}
          style={{ maxWidth: 140 }}
        />
        <span className="hint">
          Legges på nettoprisen fra grossisten når materiell føres på en ordre. Kan
          overstyres per linje. Linjer som alt er ført, endres ikke.
        </span>
      </label>
      {erAdmin ? (
        <button className="button" type="submit" disabled={busy || verdi === lagret}>
          {busy ? "Lagrer…" : "Lagre"}
        </button>
      ) : (
        <span className="tiny muted">Bare administratorer kan endre påslaget.</span>
      )}
    </form>
  );
}
