"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Customer } from "@/lib/types";
import { KundeFelt, tilVerdier } from "../KundeFelt";

/**
 * Kundekortet på kundesiden. Lagre-knappen kommer når noe er endret.
 * Endringer her rører ikke tilbud eller ordrer som alt finnes.
 */
export function KundeKort({ kunde }: { kunde: Customer }) {
  const router = useRouter();
  const [verdier, setVerdier] = useState(() => tilVerdier(kunde));
  const [lagret, setLagret] = useState(() => tilVerdier(kunde));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = (Object.keys(verdier) as (keyof typeof verdier)[]).some(
    (k) => verdier[k].trim() !== lagret[k].trim(),
  );

  async function lagre() {
    if (!verdier.name.trim()) {
      setError("Kunden må ha et navn.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${kunde.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verdier),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(verdier);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Kundekort
        </span>
        {endret && (
          <button type="button" className="button" onClick={lagre} disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      <KundeFelt verdier={verdier} onChange={setVerdier} />
    </div>
  );
}
