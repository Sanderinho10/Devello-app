"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HentFakturaer } from "@/components/HentFakturaer";
import { Panel, Rad } from "./Panel";
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
    <>
      <Panel
        tittel="PowerOffice Go"
        hint="Ingenting bokføres eller sendes fra Devello — fakturaen sendes fra regnskapssystemet."
        hoyre={
          aktiv && kopling ? (
            <span className={`pill ${kopling.status === "aktiv" ? "ferdig" : "sperret"}`}>
              {kopling.status === "aktiv" ? "Tilkoblet" : "Feil"}
            </span>
          ) : (
            <span className="pill utkast_klar">Ikke tilkoblet</span>
          )
        }
      >
        {error && <div className="banner error">{error}</div>}

        {aktiv && kopling && !visSkjema ? (
          <>
            <dl className="inst-status">
              <dt>System</dt>
              <dd>{ACCOUNTING_PROVIDER_LABELS[kopling.provider]}</dd>
              <dt>Miljø</dt>
              <dd>{kopling.environment === "demo" ? "Demo" : "Produksjon"}</dd>
              <dt>Sist hentet</dt>
              <dd>
                {kopling.last_sync_at
                  ? `${formatDate(kopling.last_sync_at)}${kopling.last_sync_note ? ` — ${kopling.last_sync_note}` : ""}`
                  : "Ingen fakturaer hentet ennå"}
              </dd>
            </dl>
            {kopling.status === "feil" && kopling.status_reason && <div className="banner error">{kopling.status_reason}</div>}
            <div className="inst-knapper">
              <HentFakturaer />
              {erAdmin && (
                <>
                  <button type="button" className="button secondary" onClick={() => setVisSkjema(true)}>
                    Bytt nøkkel
                  </button>
                  <button type="button" className="button ghost" onClick={kopleFra} disabled={busy !== null}>
                    {busy === "kople_fra" ? "Kobler fra…" : "Koble fra"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : erAdmin ? (
          <form onSubmit={kople}>
            <p className="tiny muted" style={{ margin: "0 0 14px" }}>
              Leverandørfakturaer hentes og legges på ordren de hører til, og godkjente fakturaforslag legges tilbake som
              ordreutkast.
            </p>
            <Rad etikett="System" smal>
              <select className="input" value="poweroffice" disabled>
                <option value="poweroffice">PowerOffice Go</option>
              </select>
            </Rad>
            <Rad etikett="Miljø" smal>
              <select className="input" value={environment} onChange={(e) => setEnvironment(e.target.value as AccountingEnv)}>
                <option value="production">Produksjon</option>
                <option value="demo">Demo</option>
              </select>
            </Rad>
            <Rad
              etikett="Client key"
              topp
              hint={
                <>
                  I Go: Meny → Innstillinger → Utvidelser → Legg til utvidelse → «Egendefinert utvidelse». Lim inn Devello sin
                  application key
                  {appKey ? (
                    <>
                      {" "}
                      <code className="kode">{appKey}</code>
                    </>
                  ) : (
                    " (ikke satt i dette miljøet)"
                  )}
                  , gi utvidelsen tilgang til inngående faktura, bilagsdokumentasjon og leverandør (lesing) og til
                  salgsordre, kunde og produkt (uten «send faktura»), og kopier client key hit. Nøkkelen vises aldri igjen.
                </>
              }
            >
              <input
                className="input"
                type="password"
                autoComplete="off"
                value={clientKey}
                onChange={(e) => setClientKey(e.target.value)}
                required
              />
            </Rad>
            <div className="inst-knapper" style={{ paddingLeft: 0 }}>
              <button className="button" type="submit" disabled={busy !== null || !clientKey.trim()}>
                {busy === "test" ? "Tester…" : "Test og koble til"}
              </button>
              {aktiv && (
                <button type="button" className="button secondary" onClick={() => setVisSkjema(false)}>
                  Avbryt
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="muted" style={{ margin: "0 0 14px" }}>
            Ikke tilkoblet. Bare administratorer kan koble til.
          </p>
        )}
      </Panel>

      {aktiv && kopling && !visSkjema && <ProdukterIGo kopling={kopling} erAdmin={erAdmin} />}
    </>
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
    <Panel
      tittel="Produkter i Go"
      hint="Hver linje på fakturaforslaget går på et produkt i Go — produktet bærer salgskonto og mva-kode."
      hoyre={
        manglar.length > 0 ? (
          <span className="pill utkast_klar">{manglar.length} mangler</span>
        ) : (
          <span className="pill ferdig">Komplett</span>
        )
      }
      bunn={
        erAdmin ? (
          <div className="inst-lagre">
            <button type="button" className="button secondary" onClick={hent} disabled={busy !== null}>
              {busy === "hent" ? "Henter…" : "Hent produkter fra Go"}
            </button>
            <button type="button" className="button ghost" onClick={standard} disabled={busy !== null}>
              {busy === "standard" ? "Oppretter…" : "Opprett standardprodukter"}
            </button>
            <span className="spacer" />
            <span className={`tiny ${dirty ? "inst-endret" : "muted"}`}>{dirty ? "Ulagrede endringer" : ""}</span>
            <button type="button" className="button" onClick={lagre} disabled={busy !== null || !dirty}>
              {busy === "lagre" ? "Lagrer…" : "Lagre"}
            </button>
          </div>
        ) : undefined
      }
    >
      {feil && <div className="banner error">{feil}</div>}
      {melding && <div className="banner info">{melding}</div>}
      {NOKLAR.map((k) => (
        <Rad key={k} etikett={PRODUCT_MAP_LABELS[k]}>
          <select
            className="input"
            value={map[k] ?? ""}
            disabled={!erAdmin || produkter === null}
            onChange={(e) => setMap({ ...map, [k]: e.target.value || undefined })}
          >
            <option value="">{produkter === null ? "Henter…" : "— velg produkt —"}</option>
            {map[k] && !produkter?.some((p) => p.code === map[k]) && <option value={map[k]}>{map[k]} (ikke i lista)</option>}
            {(produkter ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </Rad>
      ))}
      <Rad etikett="Prosjekt" som="div">
        <label className="ny-post-lagre" style={{ margin: 0 }}>
          <input type="checkbox" checked={prosjekt} disabled={!erAdmin} onChange={(e) => setProsjekt(e.target.checked)} />
          <span>Bruk ordrenummeret som prosjekt i Go</span>
        </label>
      </Rad>
    </Panel>
  );
}
