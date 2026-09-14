"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HentFakturaer } from "@/components/HentFakturaer";
import {
  ACCOUNTING_PROVIDER_LABELS,
  formatDate,
  type AccountingConnectionPublic,
  type AccountingEnv,
} from "@/lib/types";

/**
 * Koplinga til regnskapssystemet.
 *
 * Client key er kundens hemmelighet: feltet er et passordfelt, nøkkelen
 * sendes én gang og vises aldri igjen. Application key er Devello sin og
 * står i hjelpeteksten — den trenger kunden for å lage utvidelsen i Go.
 */
export function RegnskapKort({
  kopling,
  erAdmin,
  applicationKeys,
}: {
  kopling: AccountingConnectionPublic | null;
  erAdmin: boolean;
  applicationKeys: { production: string | null; demo: string | null };
}) {
  const router = useRouter();
  const aktiv = kopling && kopling.status !== "kopla_fra";
  const [environment, setEnvironment] = useState<AccountingEnv>(kopling?.environment ?? "production");
  const [clientKey, setClientKey] = useState("");
  const [busy, setBusy] = useState<null | "test" | "kople_fra">(null);
  const [error, setError] = useState<string | null>(null);
  const [visSkjema, setVisSkjema] = useState(!aktiv);

  async function kople(event: React.FormEvent) {
    event.preventDefault();
    setBusy("test");
    setError(null);
    try {
      const res = await fetch("/api/regnskap/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "poweroffice", environment, client_key: clientKey }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke koble til");
      setClientKey("");
      setVisSkjema(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function kopleFra() {
    if (!window.confirm("Koble fra PowerOffice Go? Fakturaene som alt er hentet blir liggende.")) return;
    setBusy("kople_fra");
    setError(null);
    try {
      const res = await fetch("/api/regnskap/connection", { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke koble fra");
      setVisSkjema(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const appKey = applicationKeys[environment];

  return (
    <div className="card card-pad" style={{ maxWidth: 640 }}>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Regnskapssystem
        </span>
        {aktiv && kopling && (
          <span className={`pill ${kopling.status === "aktiv" ? "ferdig" : "avbrutt"}`}>
            {kopling.status === "aktiv" ? "Tilkoblet" : "Feil"}
          </span>
        )}
      </div>
      <p className="muted tiny" style={{ marginBottom: 14 }}>
        Leverandørfakturaer hentes fra regnskapssystemet og legges på ordren de hører til.
        Devello leser bare — ingenting bokføres eller sendes.
      </p>

      {error && <div className="banner error">{error}</div>}

      {aktiv && kopling && !visSkjema ? (
        <div className="stack" style={{ gap: 10 }}>
          <div>
            <strong>{ACCOUNTING_PROVIDER_LABELS[kopling.provider]}</strong>
            <span className="tiny muted"> · {kopling.environment === "demo" ? "demomiljø" : "produksjon"}</span>
          </div>
          {kopling.status === "feil" && kopling.status_reason && (
            <div className="banner error" style={{ marginBottom: 0 }}>{kopling.status_reason}</div>
          )}
          <div className="tiny muted">
            {kopling.last_sync_at
              ? `Sist hentet ${formatDate(kopling.last_sync_at)}${kopling.last_sync_note ? ` — ${kopling.last_sync_note}` : ""}`
              : "Ingen fakturaer hentet ennå."}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <HentFakturaer />
            {erAdmin && (
              <>
                <button type="button" className="button secondary" onClick={() => setVisSkjema(true)}>
                  Bytt nøkkel
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={kopleFra}
                  disabled={busy !== null}
                >
                  {busy === "kople_fra" ? "Kobler fra…" : "Koble fra"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : erAdmin ? (
        <form onSubmit={kople}>
          <div className="grid-2">
            <label className="field">
              <span className="label">System</span>
              <select className="input" value="poweroffice" disabled>
                <option value="poweroffice">PowerOffice Go</option>
              </select>
            </label>
            <label className="field">
              <span className="label">Miljø</span>
              <select
                className="input"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as AccountingEnv)}
              >
                <option value="production">Produksjon</option>
                <option value="demo">Demo</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="label">Client key fra PowerOffice Go</span>
            <input
              className="input"
              type="password"
              autoComplete="off"
              value={clientKey}
              onChange={(e) => setClientKey(e.target.value)}
              required
            />
            <span className="hint">
              I Go: Meny → Innstillinger → Utvidelser → Legg til utvidelse → «Egendefinert
              utvidelse». Lim inn Devello sin application key
              {appKey ? (
                <>
                  {" "}
                  <code className="kode">{appKey}</code>
                </>
              ) : (
                " (ikke satt i dette miljøet)"
              )}
              , gi utvidelsen lesetilgang til inngående faktura, bilagsdokumentasjon og
              leverandør, og kopier client key hit. Produksjonstilgang krever at PowerOffice har
              godkjent Devello.
            </span>
          </label>
          <div className="row">
            <button className="button" type="submit" disabled={busy !== null || !clientKey.trim()}>
              {busy === "test" ? "Tester…" : "Test og koble til"}
            </button>
            {aktiv && (
              <button type="button" className="button ghost" onClick={() => setVisSkjema(false)}>
                Avbryt
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="muted tiny">Ikke tilkoblet. Bare administratorer kan koble til.</p>
      )}
    </div>
  );
}
