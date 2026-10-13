"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, type BoligmappaConnectionPublic } from "@/lib/types";

/**
 * Koplinga til Boligmappa. Kunden logger inn med sin egen Boligmappa
 * Bedrift-bruker (OAuth); vi får tokens som ligger bak service role.
 * Uten kopling fungerer alt annet — Boligmappa-knappene er bare borte.
 */
export function BoligmappaKort({
  kopling,
  erAdmin,
  konfigurert,
  melding,
}: {
  kopling: BoligmappaConnectionPublic | null;
  erAdmin: boolean;
  /** BOLIGMAPPA_CLIENT_ID og -SECRET finnes i miljøet. */
  konfigurert: boolean;
  melding: { feil?: string; koblet?: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(melding.feil ?? null);

  async function kopleFra() {
    if (!window.confirm("Koble fra Boligmappa? Dokumenter som alt er sendt blir liggende der.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boligmappa/connection", { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke koble fra");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Boligmappa
        </span>
        {kopling && <span className={`pill ${kopling.status === "aktiv" ? "ferdig" : "avbrutt"}`}>{kopling.status === "aktiv" ? "Tilkoblet" : "Feil"}</span>}
      </div>
      <p className="muted tiny" style={{ marginBottom: 14 }}>
        Ferdig dokumentasjon sendes til eiendommens Boligmappa med ett trykk fra ordren. Kobles til med
        firmaets Boligmappa Bedrift-innlogging.
      </p>

      {error && <div className="banner error">{error}</div>}
      {melding.koblet && !error && <div className="banner success">Koblet til Boligmappa{melding.koblet !== "1" ? ` som ${melding.koblet}` : ""}.</div>}

      {kopling ? (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <strong>{kopling.bm_user_name ?? "Boligmappa Bedrift"}</strong>
            {kopling.bm_company_name && <span>, {kopling.bm_company_name}</span>}
            <span className="tiny muted"> · {kopling.environment === "staging" ? "staging" : "produksjon"} · koblet {formatDate(kopling.created_at)}</span>
          </div>
          {kopling.status === "feil" && kopling.status_reason && <div className="banner error" style={{ marginBottom: 0 }}>{kopling.status_reason}</div>}
          {erAdmin && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <a className="button secondary" href="/api/boligmappa/auth/start">
                {kopling.status === "feil" ? "Logg inn på nytt" : "Koble til på nytt"}
              </a>
              <button type="button" className="button ghost" onClick={kopleFra} disabled={busy}>
                {busy ? "Kobler fra…" : "Koble fra"}
              </button>
            </div>
          )}
        </div>
      ) : erAdmin ? (
        konfigurert ? (
          <div>
            <a className="button" href="/api/boligmappa/auth/start">
              Koble til Boligmappa
            </a>
            <span className="hint" style={{ display: "block", marginTop: 8 }}>
              Du sendes til Boligmappa og logger inn med Bedrift-brukeren. Devello får lov til å laste opp
              dokumentasjon på firmaets vegne — ikke noe annet.
            </span>
          </div>
        ) : (
          <p className="muted tiny">
            Boligmappa er ikke satt opp i dette miljøet ennå (BOLIGMAPPA_CLIENT_ID og BOLIGMAPPA_CLIENT_SECRET mangler).
          </p>
        )
      ) : (
        <p className="muted tiny">Ikke tilkoblet. Bare administratorer kan koble til.</p>
      )}
    </div>
  );
}
