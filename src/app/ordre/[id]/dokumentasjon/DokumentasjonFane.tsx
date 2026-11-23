"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { formatDate, type BoligmappaEigedom, type OrderDocument, type OrderStatus } from "@/lib/types";

/**
 * Dokumentasjonen på ordren.
 *
 * Øverst eiendommen i Boligmappa (finn én gang per ordre), så lista over
 * dokumenter med status og Boligmappa-merke, og «Nytt dokument»: et skjema
 * fra en mal, eller en fil — på mobil åpner kameraet. «Fra tidligere
 * ordrer» henter fram dokumentasjonen fra kundens forrige jobber.
 *
 * Et dokument som er sendt til Boligmappa røres ikke: «Ny versjon» lager en
 * kopi som kan rettes, og «Slett fra Boligmappa» tar bort fila firmaet selv
 * la der.
 */

interface MalValg {
  key: string;
  title: string;
  lovgrunnlag: string;
  beskrivelse: string | null;
}

interface OrdreInfo {
  id: string;
  order_no: number;
  status: OrderStatus;
  site_address: string | null;
  boligmappa_number: string | null;
  boligmappa_property: BoligmappaEigedom | null;
}

interface AdresseTreff {
  id: string;
  tekst: string;
}

interface GateTreff {
  id: string;
  navn: string;
  tekst: string;
}

interface TidligereOrdre {
  id: string;
  order_no: number;
  title: string;
  site_address: string | null;
  created_at: string;
  dokument: { id: string; kind: string; title: string; type: string; dato: string; url: string }[];
}

interface EigedomTreff {
  boligmappaNumber: string;
  address: string | null;
  unitNumber: string | null;
  propertyType: string | null;
  cadastre: BoligmappaEigedom["cadastre"];
  owners?: string[];
}

export function DokumentasjonFane({
  ordre,
  dokument,
  malar,
  boligmappa,
  erAdmin,
}: {
  ordre: OrdreInfo;
  dokument: OrderDocument[];
  malar: MalValg[];
  boligmappa: { status: "aktiv" | "feil"; status_reason: string | null; environment: string } | null;
  erAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nytt, setNytt] = useState(false);
  const [tidligere, setTidligere] = useState(false);
  const filInput = useRef<HTMLInputElement>(null);

  const kanLeggeTil = ordre.status !== "avbrutt";
  const harBoligmappa = boligmappa !== null;
  const ferdige = dokument.filter((d) => d.status === "ferdig");
  const usendte = ferdige.filter((d) => !d.boligmappa_file_id);

  async function post(url: string, body: unknown, nokkel: string): Promise<Record<string, unknown> | null> {
    setBusy(nokkel);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((payload.error as string) ?? "Noe gikk galt");
      router.refresh();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function nyttSkjema(key: string) {
    const r = await post(`/api/orders/${ordre.id}/dokumenter`, { kind: "skjema", template_key: key }, `mal:${key}`);
    if (r?.id) router.push(`/ordre/${ordre.id}/dokumentasjon/${r.id}`);
  }

  async function lastOpp(file: File) {
    setBusy("fil");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/orders/${ordre.id}/dokumenter`, { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Opplastingen feilet");
      setNytt(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (filInput.current) filInput.current.value = "";
    }
  }

  async function gjenopne(d: OrderDocument) {
    const spor = d.boligmappa_file_id
      ? `«${d.title}» er sendt til Boligmappa. Det lages en kopi du kan rette — den sendte versjonen blir stående. Lage ny versjon?`
      : `Gjenåpne «${d.title}»? PDF-en slettes, og skjemaet må fullføres på nytt.`;
    if (!window.confirm(spor)) return;
    const r = await post(`/api/orders/${ordre.id}/dokumenter/${d.id}/gjenopne`, {}, `gjenopne:${d.id}`);
    if (r?.kopi && r.id) router.push(`/ordre/${ordre.id}/dokumentasjon/${r.id}`);
  }

  async function slettFraBoligmappa(d: OrderDocument) {
    if (!window.confirm(`Slette «${d.title}» fra Boligmappa? Fila fjernes fra eiendommens mappe. Dokumentet blir stående her på ordren.`)) return;
    setBusy(`bm-slett:${d.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${ordre.id}/dokumenter/${d.id}/boligmappa`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette fra Boligmappa");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function slett(d: OrderDocument) {
    if (!window.confirm(`Slette «${d.title}»?`)) return;
    setBusy(`slett:${d.id}`);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${ordre.id}/dokumenter/${d.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack fane-mobil">
      <BoligmappaKort ordre={ordre} kopling={boligmappa} />

      {error && <div className="banner error" style={{ marginBottom: 0 }}>{error}</div>}

      {/* Verktøylinja som i Go: nytt dokument først, sending etter. */}
      <div className="verktoylinje" style={{ margin: 0 }}>
          {kanLeggeTil && (
            <button type="button" className="button" onClick={() => setNytt(true)}>
              Nytt dokument
            </button>
          )}
          <button type="button" className="button secondary" onClick={() => setTidligere(true)}>
            Fra tidligere ordrer
          </button>
          {harBoligmappa && ordre.boligmappa_number && usendte.length > 0 && (
            <button
              type="button"
              className="button secondary"
              disabled={busy !== null}
              onClick={async () => {
                const r = await post(`/api/orders/${ordre.id}/boligmappa/send-alle`, {}, "send-alle");
                if (r && Array.isArray(r.feil) && r.feil.length) setError((r.feil as string[]).join(" · "));
              }}
            >
              {busy === "send-alle" ? "Sender…" : `Send alle ferdige til Boligmappa (${usendte.length})`}
            </button>
          )}
      </div>

      <TidligereDokumenter orderId={ordre.id} open={tidligere} onClose={() => setTidligere(false)} />

      {/* Nytt dokument som popup: et skjema fra mal, eller en fil. */}
      <Modal open={nytt} onClose={() => busy === null && setNytt(false)} size="wide" title="Nytt dokument">
        <div className="kontakt-panel ny-post-panel">
          <div className="label">Skjema fra mal</div>
          <div className="mal-liste">
            {malar.map((m) => (
              <button
                key={m.key}
                type="button"
                className="mal-valg"
                disabled={busy !== null}
                onClick={() => nyttSkjema(m.key)}
              >
                <span style={{ display: "block", fontWeight: 600 }}>{busy === `mal:${m.key}` ? "Oppretter…" : m.title}</span>
                <span className="tiny muted">{m.lovgrunnlag}</span>
                {m.beskrivelse && <span className="tiny muted" style={{ display: "block", marginTop: 3 }}>{m.beskrivelse}</span>}
              </button>
            ))}
          </div>
          <div className="kontakt-skilje">Fil eller bilde</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button type="button" className="button secondary" disabled={busy !== null} onClick={() => filInput.current?.click()}>
              {busy === "fil" ? "Laster opp…" : "Last opp fil eller ta bilde"}
            </button>
            <span className="tiny muted">Datablad, FDV, bilde av skapet. På mobil åpner kameraet.</span>
          </div>
          <input
            ref={filInput}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lastOpp(f);
            }}
          />
        </div>
      </Modal>

      <div className="card">
        {dokument.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen dokumentasjon ennå</div>
            <div>{kanLeggeTil ? "Trykk «Nytt dokument» for et skjema fra mal, eller last opp en fil." : "Ordren er avbrutt."}</div>
          </div>
        ) : (
          <div className="tabell-rull">
          <table className="table tabell-mobil dokument-tabell">
            <thead>
              <tr>
                <th>Dokument</th>
                <th>Type</th>
                <th>Status</th>
                {harBoligmappa && <th>Boligmappa</th>}
                <th>Endret</th>
                <th aria-label="Handling" />
              </tr>
            </thead>
            <tbody>
            {dokument.map((d) => (
              <DokumentRad
                key={d.id}
                d={d}
                ordre={ordre}
                harBoligmappa={harBoligmappa}
                erAdmin={erAdmin}
                busy={busy}
                onSend={() => post(`/api/orders/${ordre.id}/dokumenter/${d.id}/boligmappa`, {}, `send:${d.id}`)}
                onSlett={() => slett(d)}
                onGjenopne={() => void gjenopne(d)}
                onSlettFraBoligmappa={() => void slettFraBoligmappa(d)}
              />
            ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DokumentRad({
  d,
  ordre,
  harBoligmappa,
  erAdmin,
  busy,
  onSend,
  onSlett,
  onGjenopne,
  onSlettFraBoligmappa,
}: {
  d: OrderDocument;
  ordre: OrdreInfo;
  harBoligmappa: boolean;
  erAdmin: boolean;
  busy: string | null;
  onSend: () => void;
  onSlett: () => void;
  onGjenopne: () => void;
  onSlettFraBoligmappa: () => void;
}) {
  const skjema = d.kind === "skjema";
  const ferdig = d.status === "ferdig";
  const kanSende = harBoligmappa && ordre.boligmappa_number && ferdig && !d.boligmappa_file_id;
  return (
    <tr className="dokument-rad">
      <td className="hoved">
        {skjema ? (
          <Link className="lenke" href={`/ordre/${ordre.id}/dokumentasjon/${d.id}`}>
            {d.title}
          </Link>
        ) : (
          <a className="lenke" href={`/api/orders/${ordre.id}/dokumenter/${d.id}/fil`} target="_blank" rel="noreferrer">
            {d.title}
          </a>
        )}
        {d.revision > 1 && <span className="pill versjon" style={{ marginLeft: 8 }}>v{d.revision}</span>}
        {d.boligmappa_error && !d.boligmappa_file_id && (
          <div className="tiny" style={{ color: "var(--negative)", marginTop: 2 }}>{d.boligmappa_error}</div>
        )}
      </td>
      <td className="meta">{skjema ? "Skjema" : d.mime_type?.startsWith("image/") ? "Bilde" : "Fil"}</td>
      <td className="belop">
        <span className={`pill ${ferdig ? "ferdig" : d.approval_requested_at ? "paagaar" : "opna"}`}>
          {ferdig ? "Ferdig" : d.approval_requested_at ? "Til godkjenning" : "Utkast"}
        </span>
      </td>
      {harBoligmappa && (
        <td className="meta">
          <span
            className={`pill ${d.boligmappa_file_id ? "ferdig" : d.boligmappa_error ? "avbrutt" : "utkast_klar"}`}
            title={d.boligmappa_error ?? undefined}
          >
            {d.boligmappa_file_id ? `Sendt ${formatDag(d.boligmappa_sent_at)}` : d.boligmappa_error ? "Feil" : "Ikke sendt"}
          </span>
        </td>
      )}
      <td className="meta muted">
        {ferdig && skjema
          ? `${d.signature_id ? "Signert" : "Fullført"} av ${d.signed_name ?? "—"} ${formatDate(d.signed_at)}`
          : ferdig
            ? `Lastet opp ${formatDate(d.created_at)}`
            : `Endret ${formatDate(d.updated_at)}`}
      </td>
      <td className="handling">
        <div className="celle-knapper">
        {skjema && (
          <Link className="button secondary" href={`/ordre/${ordre.id}/dokumentasjon/${d.id}`}>
            {ferdig ? "Åpne" : d.approval_requested_at ? "Godkjenn" : "Fyll ut"}
          </Link>
        )}
        {skjema && (
          <a className="button ghost" href={`/api/orders/${ordre.id}/dokumenter/${d.id}/pdf`} target="_blank" rel="noreferrer">
            PDF
          </a>
        )}
        {kanSende && (
          <button type="button" className="button" disabled={busy !== null} onClick={onSend}>
            {busy === `send:${d.id}` ? "Sender…" : d.boligmappa_error ? "Prøv igjen" : "Send"}
          </button>
        )}
        {skjema && ferdig && erAdmin && (
          <button type="button" className="button ghost" disabled={busy !== null} onClick={onGjenopne}>
            {busy === `gjenopne:${d.id}` ? "Åpner…" : d.boligmappa_file_id ? "Ny versjon" : "Gjenåpne"}
          </button>
        )}
        {d.boligmappa_file_id && erAdmin && (
          <button
            type="button"
            className="button ghost"
            disabled={busy !== null}
            onClick={onSlettFraBoligmappa}
            title="Fjerner fila firmaet la i eiendommens Boligmappa"
          >
            {busy === `bm-slett:${d.id}` ? "Sletter…" : "Slett fra Boligmappa"}
          </button>
        )}
        {(!ferdig || !skjema) && !d.boligmappa_file_id && (
          <button type="button" className="button ghost" disabled={busy !== null} onClick={onSlett}>
            Slett
          </button>
        )}
        </div>
      </td>
    </tr>
  );
}

/** Eiendommen i Boligmappa: vist, eller søkt opp og bekreftet. */
function BoligmappaKort({
  ordre,
  kopling,
}: {
  ordre: OrdreInfo;
  kopling: { status: "aktiv" | "feil"; status_reason: string | null; environment: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(ordre.site_address ?? "");
  const [adresser, setAdresser] = useState<AdresseTreff[] | null>(null);
  const [gater, setGater] = useState<GateTreff[]>([]);
  // Gaten brukeren valgte blant forslagene — snevrer inn adressesøket.
  const [gate, setGate] = useState<GateTreff | null>(null);
  const [eigedomar, setEigedomar] = useState<EigedomTreff[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [soker, setSoker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const felt = useRef<HTMLInputElement>(null);
  const sist = useRef("");

  // Søket går mens man skriver: gatene først, adressene når husnummeret er
  // med. Et tregt svar på en eldre tekst skal aldri skrive over det nye.
  useEffect(() => {
    if (!open || !kopling || kopling.status === "feil") return;
    const tekst = q.trim();
    sist.current = tekst;
    if (tekst.length < 3) {
      setGater([]);
      setAdresser(null);
      setSoker(false);
      return;
    }
    setSoker(true);
    const t = setTimeout(async () => {
      try {
        const gateId = gate && tekst.toLowerCase().startsWith(gate.navn.toLowerCase()) ? `&gate=${encodeURIComponent(gate.id)}` : "";
        const res = await fetch(`/api/boligmappa/sok?q=${encodeURIComponent(tekst)}${gateId}`);
        const payload = await res.json();
        if (sist.current !== tekst) return;
        if (!res.ok) throw new Error(payload.error ?? "Søket feilet");
        setError(null);
        setEigedomar(null);
        setGater((payload.gater ?? []) as GateTreff[]);
        // null = ikke søkt på adresser ennå (bare gatenavn skrevet).
        setAdresser(/(^|\s)\d{1,4}[A-Za-zÆØÅæøå]?(\s|$)/.test(tekst) ? ((payload.adresser ?? []) as AdresseTreff[]) : null);
      } catch (err) {
        if (sist.current === tekst) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (sist.current === tekst) setSoker(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, open, gate, kopling]);

  if (!kopling) {
    return (
      <div className="card card-pad boligmappa-kort">
        <span className="label">Boligmappa</span>
        <p className="muted tiny" style={{ margin: 0 }}>
          Ikke koblet til.{" "}
          <Link href="/selskap/innstillinger/boligmappa" style={{ textDecoration: "underline" }}>
            Koble til Boligmappa under Selskap → Innstillinger → Boligmappa
          </Link>{" "}
          for å sende dokumentasjonen dit. Alt annet fungerer uten.
        </p>
      </div>
    );
  }

  /** Gaten er valgt: sett den i feltet, og vent på husnummeret. */
  function velgGate(g: GateTreff) {
    setGate(g);
    setGater([]);
    setQ(`${g.navn} `);
    felt.current?.focus();
  }

  async function velgAdresse(a: AdresseTreff) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/boligmappa/eigedomar?addressId=${encodeURIComponent(a.id)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente eiendommene");
      const liste = (payload.eigedomar ?? []) as EigedomTreff[];
      if (liste.length === 1) return bekreft(liste[0]);
      setEigedomar(liste);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function bekreft(e: EigedomTreff | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${ordre.id}/boligmappa/eigedom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e ? { boligmappa_number: e.boligmappaNumber, property: e } : {}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setOpen(false);
      setAdresser(null);
      setEigedomar(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const p = ordre.boligmappa_property;

  return (
    <div className="card card-pad boligmappa-kort">
      <div className="row-between" style={{ marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Boligmappa{kopling.environment === "staging" ? " · staging" : ""}
        </span>
        {kopling.status === "feil" ? (
          <span className="pill avbrutt">Feil</span>
        ) : ordre.boligmappa_number ? (
          <span className="pill ferdig">Eiendom bekreftet</span>
        ) : (
          <span className="pill opna">Ingen eiendom valgt</span>
        )}
      </div>
      {kopling.status === "feil" && (
        <div className="banner error">
          {kopling.status_reason ?? "Koplinga virker ikke."}{" "}
          <Link href="/selskap/innstillinger/boligmappa" style={{ textDecoration: "underline" }}>
            Innstillinger
          </Link>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}

      {ordre.boligmappa_number && !open ? (
        <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <strong>Eiendom: {p?.address ?? "—"}</strong>
            {p?.unitNumber && <span>, {p.unitNumber}</span>}
            <span className="tiny muted"> · {ordre.boligmappa_number} ✓</span>
            {p?.owners && p.owners.length > 0 && <div className="tiny">Eier: {p.owners.join(", ")}</div>}
            {p?.cadastre && (
              <div className="tiny muted">
                {["knr", "gnr", "bnr", "fnr", "snr"]
                  .filter((k) => p.cadastre?.[k as keyof typeof p.cadastre])
                  .map((k) => `${k} ${p.cadastre?.[k as keyof typeof p.cadastre]}`)
                  .join(" · ")}
              </div>
            )}
          </div>
          <button type="button" className="linkish" onClick={() => setOpen(true)}>
            Endre
          </button>
        </div>
      ) : (
        <div>
          {!open ? (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button type="button" className="button" onClick={() => setOpen(true)} disabled={kopling.status === "feil"}>
                Finn eiendom
              </button>
              <span className="tiny muted">Slås opp én gang per ordre. Adressen på ordren er fylt inn, og treffene kommer mens du skriver.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row">
                <input
                  ref={felt}
                  className="input"
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (gate && !e.target.value.toLowerCase().startsWith(gate.navn.toLowerCase())) setGate(null);
                  }}
                  placeholder="Gatenavn og husnummer — Bjørkevegen 22"
                  aria-label="Søk etter eiendommen"
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button type="button" className="button ghost" onClick={() => setOpen(false)}>
                  Avbryt
                </button>
              </div>
              <div className="tiny muted" aria-live="polite">
                {soker
                  ? "Søker…"
                  : q.trim().length < 3
                    ? "Skriv gatenavnet. Treffene kommer mens du skriver."
                    : adresser === null && gater.length > 0
                      ? "Velg gaten, eller skriv husnummeret for å se adressene."
                      : ""}
              </div>
              {!eigedomar && !soker && adresser === null && q.trim().length >= 3 && (
                <div className="lead-list boligmappa-treff">
                  {gater.length === 0 && <div className="empty">Fant ingen gate med det navnet.</div>}
                  {gater.map((g) => (
                    <button key={g.id} type="button" className="ordre-velger-rad" disabled={busy} onClick={() => velgGate(g)}>
                      <span className="lead-main">{g.tekst}</span>
                    </button>
                  ))}
                </div>
              )}
              {adresser && !eigedomar && !soker && (
                <div className="lead-list boligmappa-treff">
                  {adresser.length === 0 && <div className="empty">Ingen adresse med det husnummeret. Sjekk nummeret og gatenavnet.</div>}
                  {adresser.map((a, i) => (
                    <button key={`${a.id}-${i}`} type="button" className="ordre-velger-rad" disabled={busy} onClick={() => velgAdresse(a)}>
                      <span className="lead-main">{a.tekst}</span>
                    </button>
                  ))}
                </div>
              )}
              {eigedomar && (
                <div>
                  <div className="tiny muted" style={{ marginBottom: 6 }}>
                    Flere enheter på adressen — velg riktig.
                  </div>
                  <div className="lead-list boligmappa-treff">
                    {eigedomar.length === 0 && <div className="empty">Ingen eiendommer registrert på adressen.</div>}
                    {eigedomar.map((e) => (
                      <button key={e.boligmappaNumber} type="button" className="ordre-velger-rad" disabled={busy} onClick={() => bekreft(e)}>
                        <span className="ordre-nr">{e.unitNumber ?? e.propertyType ?? "—"}</span>
                        <span className="lead-main">
                          <span style={{ display: "block", fontWeight: 550 }}>{e.address ?? e.boligmappaNumber}</span>
                          {e.owners && e.owners.length > 0 && <span style={{ display: "block" }}>Eier: {e.owners.join(", ")}</span>}
                          <span className="tiny muted">{e.boligmappaNumber}{e.propertyType ? ` · ${e.propertyType}` : ""}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {ordre.boligmappa_number && (
                <button type="button" className="linkish" onClick={() => bekreft(null)} disabled={busy}>
                  Fjern eiendommen fra ordren
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dokumentasjonen fra kundens tidligere ordrer, til nedlasting. Hentes når
 * popupen åpnes — de fleste gangene trenger man den ikke.
 */
function TidligereDokumenter({ orderId, open, onClose }: { orderId: string; open: boolean; onClose: () => void }) {
  const [ordrer, setOrdrer] = useState<TidligereOrdre[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let avbrutt = false;
    setOrdrer(null);
    setError(null);
    fetch(`/api/orders/${orderId}/dokumenter/tidligere`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente dokumentene");
        if (!avbrutt) setOrdrer(payload.ordrer as TidligereOrdre[]);
      })
      .catch((err) => {
        if (!avbrutt) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      avbrutt = true;
    };
  }, [open, orderId]);

  return (
    <Modal open={open} onClose={onClose} size="wide" title="Dokumenter fra tidligere ordrer">
      {error && <div className="banner error">{error}</div>}
      {!error && ordrer === null && <div className="empty">Henter…</div>}
      {ordrer && ordrer.length === 0 && (
        <div className="empty">
          <div className="empty-title">Ingen tidligere dokumentasjon</div>
          <div>Kunden har ingen andre ordrer med ferdige dokumenter — verken på kunden eller på adressen.</div>
        </div>
      )}
      {ordrer?.map((o) => (
        <div key={o.id} className="tidligere-ordre">
          <div className="row-between" style={{ flexWrap: "wrap", gap: 6 }}>
            <Link className="lenke" href={`/ordre/${o.id}/dokumentasjon`} style={{ fontWeight: 600 }}>
              Ordre #{o.order_no} · {o.title}
            </Link>
            <span className="tiny muted">
              {[o.site_address, formatDate(o.created_at)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="lead-list">
            {o.dokument.map((d) => (
              <div key={d.id} className="lead-row">
                <div className="lead-main">
                  {d.title}
                  <span className="tiny muted"> · {d.type} · {formatDate(d.dato)}</span>
                </div>
                <span className="row" style={{ gap: 6 }}>
                  <a className="button ghost" href={d.url} target="_blank" rel="noreferrer">
                    Åpne
                  </a>
                  <a className="button secondary" href={`${d.url}?download=1`}>
                    Last ned
                  </a>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

function formatDag(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
