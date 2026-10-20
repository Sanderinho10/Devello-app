"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Customer } from "@/lib/types";
import { KontaktFelt, erEndret, harType, tilVerdier } from "../KontaktFelt";

/**
 * Kontaktkortet på kontaktsiden. Lagre-knappen kommer når noe er endret.
 * Endringer her rører ikke tilbud eller ordrer som alt finnes.
 */
export function KontaktKort({ kontakt }: { kontakt: Customer }) {
  const router = useRouter();
  const [verdier, setVerdier] = useState(() => tilVerdier(kontakt));
  const [lagret, setLagret] = useState(() => tilVerdier(kontakt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = erEndret(verdier, lagret);

  async function lagre() {
    if (!verdier.name.trim()) {
      setError("Kontakten må ha et navn.");
      return;
    }
    if (!harType(verdier)) {
      setError("Kryss av for kunde, leverandør eller begge.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${kontakt.id}`, {
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
          Kontaktkort
        </span>
        {endret && (
          <button type="button" className="button" onClick={lagre} disabled={busy || !harType(verdier)}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      <KontaktFelt verdier={verdier} onChange={setVerdier} />
    </div>
  );
}
