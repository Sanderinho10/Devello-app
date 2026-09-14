"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * «Hent fakturaer nå». Samme form som «Hent leads»: én knapp, resultatet
 * som en kort linje ved siden av, og sida oppdaterer seg.
 */
export function HentFakturaer() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [feil, setFeil] = useState(false);

  async function hent() {
    setBusy(true);
    setMelding(null);
    setFeil(false);
    try {
      const res = await fetch("/api/regnskap/sync", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente");
      const r = payload as { henta: number; nye: number; kopla: number; delvis: number; ukopla: number; feil: string[] };
      setMelding(
        `${r.henta} hentet, ${r.nye} nye, ${r.kopla} koblet, ${r.ukopla} ukoblet` +
          (r.feil.length ? ` — ${r.feil.length} feil: ${r.feil[0]}` : ""),
      );
      setFeil(r.feil.length > 0);
      router.refresh();
    } catch (err) {
      setMelding(err instanceof Error ? err.message : String(err));
      setFeil(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ flexWrap: "wrap" }}>
      <button type="button" className="button" onClick={hent} disabled={busy}>
        {busy ? "Henter…" : "Hent fakturaer nå"}
      </button>
      {melding && (
        <span className="tiny" style={{ color: feil ? "#a4271b" : "var(--text-secondary)" }}>
          {melding}
        </span>
      )}
    </span>
  );
}
