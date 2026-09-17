"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HentFakturaer } from "@/components/HentFakturaer";
import {
  ACCOUNTING_PROVIDER_LABELS,
  PRODUCT_MAP_LABELS,
  formatDate,
  type AccountingConnectionPublic,
  type AccountingEnv,
  type ProductMap,
  type ProductMapKey,
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
        Leverandørfakturaer hentes fra regnskapssystemet og legges på ordren de hører til, og
        godkjente fakturaforslag legges tilbake som ordreutkast. Ingenting bokføres eller sendes
        fra Devello — fakturaen sendes fra regnskapssystemet.
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
          <ProdukterIGo kopling={kopling} erAdmin={erAdmin} />
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
              , gi utvidelsen tilgang til inngående faktura, bilagsdokumentasjon og leverandør
              (lesing) og til salgsordre, kunde og produkt (for fakturaforslagene — uten
              «send faktura»), og kopier client key hit. Produksjonstilgang krever at PowerOffice
              har godkjent Devello.
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

const NOKLAR: ProductMapKey[] = ["arbeid", "materiell", "fastpris", "annet"];

/**
 * Produktene i Go som fakturalinjene skal gå på. Produktet bærer salgskonto
 * og mva-kode i Go — derfor må hver linjetype ha ett. «Opprett
 * standardprodukter» lager DEV-ARB/-MAT/-FAST/-ANN og fyller mappingen;
 * salgskonto og mva må sjekkes i Go etterpå.
 */
function ProdukterIGo({ kopling, erAdmin }: { kopling: AccountingConnectionPublic; erAdmin: boolean }) {
  const router = useRouter();
  const [produkter, setProdukter] = useState<{ code: string; name: string }[] | null>(null);
  const [map, setMap] = useState<ProductMap>(kopling.product_map ?? {});
  const [prosjekt, setProsjekt] = useState(Boolean(kopling.settings?.project_per_order));
  const [busy, setBusy] = useState<null | "hent" | "standard" | "lagre">(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const dirty =
    NOKLAR.some((k) => (map[k] ?? "") !== (kopling.product_map?.[k] ?? "")) ||
    prosjekt !== Boolean(kopling.settings?.project_per_order);

  async function hentListe(): Promise<{ code: string; name: string }[]> {
    const res = await fetch("/api/regnskap/produkter");
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente produkter");
    return payload.produkter ?? [];
  }

  async function hent() {
    setBusy("hent");
    setFeil(null);
    try {
      setProdukter(await hentListe());
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
      setProdukter([]);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Go bruker et par sekunder før et nyopprettet produkt dukker opp i
   * lista. Etter «Opprett standardprodukter» henter vi til alle kodene er
   * der, så nedtrekkene ikke sier «ikke i lista» om noe som nettopp ble laget.
   */
  async function hentTilAlleFinst(koder: string[]) {
    for (let forsok = 0; forsok < 6; forsok++) {
      const liste = await hentListe();
      setProdukter(liste);
      const har = new Set(liste.map((p) => p.code));
      if (koder.every((k) => har.has(k))) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  useEffect(() => {
    void hent();
    // Én gang når kortet vises. Knappen henter på nytt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function standard() {
    if (!window.confirm("Opprette produktene DEV-ARB, DEV-MAT, DEV-FAST og DEV-ANN i PowerOffice Go?")) return;
    setBusy("standard");
    setFeil(null);
    setMelding(null);
    try {
      const res = await fetch("/api/regnskap/produkter/standard", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette");
      const nyMap = (payload.product_map ?? {}) as ProductMap;
      setMap(nyMap);
      setMelding(payload.melding ?? null);
      await hentTilAlleFinst(Object.values(nyMap).filter((v): v is string => Boolean(v)));
      router.refresh();
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function lagre() {
    setBusy("lagre");
    setFeil(null);
    setMelding(null);
    try {
      const res = await fetch("/api/regnskap/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_map: map, settings: { project_per_order: prosjekt } }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setMelding("Lagret.");
      router.refresh();
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const manglar = NOKLAR.filter((k) => !map[k]);

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Produkter i Go
        </span>
        {manglar.length > 0 ? (
          <span className="pill opna">{manglar.length} mangler</span>
        ) : (
          <span className="pill ferdig">Komplett</span>
        )}
      </div>
      <p className="muted tiny" style={{ marginBottom: 10 }}>
        Hver linje på fakturaforslaget går på et produkt i Go — produktet bærer salgskonto og
        mva-kode. Velg fra listen, eller opprett Devellos standardprodukter.
      </p>
      {feil && <div className="banner error">{feil}</div>}
      {melding && <div className="banner info">{melding}</div>}

      <div className="produkt-map">
        {NOKLAR.map((k) => (
          <label key={k} className="field" style={{ marginBottom: 0 }}>
            <span className="label">{PRODUCT_MAP_LABELS[k]}</span>
            <select
              className="input"
              value={map[k] ?? ""}
              disabled={!erAdmin || produkter === null}
              onChange={(e) => setMap({ ...map, [k]: e.target.value || undefined })}
            >
              <option value="">{produkter === null ? "Henter…" : "— velg produkt —"}</option>
              {map[k] && !produkter?.some((p) => p.code === map[k]) && (
                <option value={map[k]}>{map[k]} (ikke i lista)</option>
              )}
              {(produkter ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <label className="row" style={{ marginTop: 12, gap: 8, cursor: erAdmin ? "pointer" : "default" }}>
        <input type="checkbox" checked={prosjekt} disabled={!erAdmin} onChange={(e) => setProsjekt(e.target.checked)} />
        <span>Bruk ordrenummer som prosjekt i Go</span>
      </label>

      {erAdmin && (
        <div className="row" style={{ flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="button" onClick={lagre} disabled={busy !== null || !dirty}>
            {busy === "lagre" ? "Lagrer…" : "Lagre"}
          </button>
          <button type="button" className="button secondary" onClick={hent} disabled={busy !== null}>
            {busy === "hent" ? "Henter…" : "Hent produkter fra Go"}
          </button>
          <button type="button" className="button ghost" onClick={standard} disabled={busy !== null}>
            {busy === "standard" ? "Oppretter…" : "Opprett standardprodukter"}
          </button>
        </div>
      )}
    </div>
  );
}
