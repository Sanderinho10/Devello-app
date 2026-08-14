"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * «Hent leads» og «Generer utkast». Begge er manuelle knappar i v1 —
 * automatisk polling kjem i fase 2.
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

  async function run() {
    setBusy(true);
    setError(null);
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
      if (!res.ok) throw new Error(payload.error ?? "Noko gjekk gale");

      if (kind === "generer" && payload.lead_id) {
        router.push(`/tilbud/leads/${payload.lead_id}`);
      } else {
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
      {error && (
        <div className="banner error" style={{ marginTop: 10, width: "100%" }}>
          {error}
        </div>
      )}
    </>
  );
}
