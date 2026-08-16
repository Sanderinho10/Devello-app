"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * «Hent leads» og «Generer utkast». Begge er manuelle knapper i v1 —
 * automatisk polling kommer i fase 2.
 */
export function LeadActions({
  kind,
  leadId,
}: {
  kind: "hent" | "generer";
  leadId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merIgjen, setMerIgjen] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setMerIgjen(false);
    try {
      const res = await fetch(
        kind === "hent" ? "/api/leads/fetch" : "/api/drafts/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: kind === "hent" ? undefined : JSON.stringify({ lead_id: leadId }),
        },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Noe gikk galt");

      if (kind === "generer" && payload.lead_id) {
        router.push(`/tilbud/leads/${payload.lead_id}`);
      } else {
        // Traff hentingen taket, ligger det fortsatt e-post i kø. Uten dette
        // ville brukeren trodd at alt var inne.
        if (payload.more) setMerIgjen(true);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={kind === "hent" ? "button" : "button secondary"}
        onClick={run}
        disabled={busy}
      >
        {busy
          ? kind === "hent"
            ? "Hentar…"
            : "Genererer…"
          : kind === "hent"
            ? "Hent leads"
            : "Generer utkast"}
      </button>
      {/* Bryt til egen linje under raden — ellers presser den emnet og
          avsenderen ut av flex-raden. */}
      {error && <div className="banner error row-break">{error}</div>}
      {merIgjen && (
        <div className="banner info row-break">
          Det ligger mer e-post i kø enn vi tar i én runde. Trykk «Hent leads»
          igjen for å hente neste bolk.
        </div>
      )}
    </>
  );
}
