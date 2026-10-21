"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate, type BoligmappaConnectionPublic } from "@/lib/types";
import { Panel } from "./Panel";

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
    <Panel
      tittel="Boligmappa Bedrift"
      hint="Kobles til med firmaets Boligmappa Bedrift-innlogging. Devello får lov til å laste opp dokumentasjon på firmaets vegne — ikke noe annet."
      hoyre={
        kopling ? (
          <span className={`pill ${kopling.status === "aktiv" ? "ferdig" : "sperret"}`}>
            {kopling.status === "aktiv" ? "Tilkoblet" : "Feil"}
          </span>
        ) : (
          <span className="pill utkast_klar">Ikke tilkoblet</span>
        )
      }
    >
      {error && <div className="banner error">{error}</div>}
      {melding.koblet && !error && (
        <div className="banner success">Koblet til Boligmappa{melding.koblet !== "1" ? ` som ${melding.koblet}` : ""}.</div>
      )}

      {kopling ? (
        <>
          <dl className="inst-status">
            <dt>Bruker</dt>
            <dd>
              <strong>{kopling.bm_user_name ?? "Boligmappa Bedrift"}</strong>
              {kopling.bm_company_name && `, ${kopling.bm_company_name}`}
            </dd>
            <dt>Miljø</dt>
            <dd>{kopling.environment === "staging" ? "Staging" : "Produksjon"}</dd>
            <dt>Koblet</dt>
            <dd>{formatDate(kopling.created_at)}</dd>
          </dl>
          {kopling.status === "feil" && kopling.status_reason && <div className="banner error">{kopling.status_reason}</div>}
          {erAdmin && (
            <div className="inst-knapper">
              <a className="button secondary" href="/api/boligmappa/auth/start">
                {kopling.status === "feil" ? "Logg inn på nytt" : "Koble til på nytt"}
              </a>
              <button type="button" className="button ghost" onClick={kopleFra} disabled={busy}>
                {busy ? "Kobler fra…" : "Koble fra"}
              </button>
            </div>
          )}
        </>
      ) : erAdmin ? (
        konfigurert ? (
          <div className="inst-knapper">
            <a className="button" href="/api/boligmappa/auth/start">
              Koble til Boligmappa
            </a>
          </div>
        ) : (
          <p className="muted" style={{ margin: "0 0 14px" }}>
            Boligmappa er ikke satt opp i dette miljøet ennå (BOLIGMAPPA_CLIENT_ID og BOLIGMAPPA_CLIENT_SECRET mangler).
          </p>
        )
      ) : (
        <p className="muted" style={{ margin: "0 0 14px" }}>
          Ikke tilkoblet. Bare administratorer kan koble til.
        </p>
      )}
    </Panel>
  );
}
