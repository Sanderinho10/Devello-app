"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatDate, type BoligmappaEigedom, type OrderDocument, type OrderStatus } from "@/lib/types";

/**
 * Dokumentasjonen på ordren.
 *
 * Øverst eiendommen i Boligmappa (finn én gang per ordre), så lista over
 * dokumenter med status og Boligmappa-merke, og «Nytt dokument»: et skjema
 * fra en mal, eller en fil — på mobil åpner kameraet.
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

interface EigedomTreff {
  boligmappaNumber: string;
  address: string | null;
  unitNumber: string | null;
  propertyType: string | null;
  cadastre: BoligmappaEigedom["cadastre"];
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

      <div className="card">
        <div className="card-header">
          <span className="label" style={{ marginBottom: 0 }}>
            Dokumenter
          </span>
          <span className="row" style={{ flexWrap: "wrap" }}>
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
                {busy === "send-alle" ? "Sender…" : `Send alle ferdige (${usendte.length})`}
              </button>
            )}
            {kanLeggeTil && (
              <button type="button" className="button" onClick={() => setNytt((v) => !v)}>
                {nytt ? "Lukk" : "Nytt dokument"}
              </button>
            )}
          </span>
        </div>

        {nytt && (
          <div className="card-pad nytt-dokument" style={{ borderBottom: "1px solid var(--border)" }}>
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
            <div className="label" style={{ marginTop: 14 }}>
              Fil eller bilde
            </div>
            <p className="tiny muted" style={{ marginBottom: 8 }}>
              Datablad, FDV, bilde av skapet. På mobil åpner kameraet.
            </p>
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
            <button type="button" className="button secondary" disabled={busy !== null} onClick={() => filInput.current?.click()}>
              {busy === "fil" ? "Laster opp…" : "Last opp fil eller ta bilde"}
            </button>
          </div>
        )}

        {dokument.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen dokumentasjon ennå</div>
            <div>{kanLeggeTil ? "Trykk «Nytt dokument» for et skjema fra mal, eller last opp en fil." : "Ordren er avbrutt."}</div>
          </div>
        ) : (
          <div className="lead-list">
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
                onGjenopne={() => {
                  if (window.confirm(`Gjenåpne «${d.title}»? PDF-en slettes, og dokumentet må sendes til Boligmappa på nytt.`)) {
                    void post(`/api/orders/${ordre.id}/dokumenter/${d.id}/gjenopne`, {}, `gjenopne:${d.id}`);
                  }
                }}
              />
            ))}
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
}: {
  d: OrderDocument;
  ordre: OrdreInfo;
  harBoligmappa: boolean;
  erAdmin: boolean;
  busy: string | null;
  onSend: () => void;
  onSlett: () => void;
  onGjenopne: () => void;
}) {
  const skjema = d.kind === "skjema";
  const ferdig = d.status === "ferdig";
  const kanSende = harBoligmappa && ordre.boligmappa_number && ferdig && !d.boligmappa_file_id;
  return (
    <div className="lead-row dokument-rad">
      <div className="lead-main">
        <div className="lead-subject" style={{ cursor: "default" }}>
          {skjema ? (
            <Link href={`/ordre/${ordre.id}/dokumentasjon/${d.id}`}>{d.title}</Link>
          ) : (
            <a href={`/api/orders/${ordre.id}/dokumenter/${d.id}/fil`} target="_blank" rel="noreferrer">
              {d.title}
            </a>
          )}
        </div>
        <div className="lead-meta">
          {skjema ? "Skjema" : d.mime_type?.startsWith("image/") ? "Bilde" : "Fil"}
          {" · "}
          {ferdig && skjema ? `Ferdig · signert av ${d.signed_name ?? "—"} ${formatDate(d.signed_at)}` : ferdig ? `Lastet opp ${formatDate(d.created_at)}` : `Utkast · endret ${formatDate(d.updated_at)}`}
        </div>
        <div className="chips">
          <span className={`pill ${ferdig ? "ferdig" : "opna"}`}>{ferdig ? "Ferdig" : "Utkast"}</span>
          {harBoligmappa && (
            <span className={`pill ${d.boligmappa_file_id ? "ferdig" : d.boligmappa_error ? "avbrutt" : "utkast_klar"}`} title={d.boligmappa_error ?? undefined}>
              {d.boligmappa_file_id ? `Boligmappa · sendt ${formatDag(d.boligmappa_sent_at)}` : d.boligmappa_error ? "Boligmappa · feil" : "Ikke sendt til Boligmappa"}
            </span>
          )}
        </div>
        {d.boligmappa_error && !d.boligmappa_file_id && (
          <div className="tiny" style={{ color: "#a4271b", marginTop: 4 }}>{d.boligmappa_error}</div>
        )}
      </div>
      <span className="row" style={{ flexWrap: "wrap" }}>
        {skjema && (
          <Link className="button secondary" href={`/ordre/${ordre.id}/dokumentasjon/${d.id}`}>
            {ferdig ? "Åpne" : "Fyll ut"}
          </Link>
        )}
        {skjema && (
          <a className="button ghost" href={`/api/orders/${ordre.id}/dokumenter/${d.id}/pdf`} target="_blank" rel="noreferrer">
            PDF
          </a>
        )}
        {kanSende && (
          <button type="button" className="button" disabled={busy !== null} onClick={onSend}>
            {busy === `send:${d.id}` ? "Sender…" : d.boligmappa_error ? "Prøv igjen" : "Send til Boligmappa"}
          </button>
        )}
        {skjema && ferdig && erAdmin && (
          <button type="button" className="linkish" disabled={busy !== null} onClick={onGjenopne}>
            Gjenåpne
          </button>
        )}
        {(!ferdig || !skjema) && !d.boligmappa_file_id && (
          <button type="button" className="linkish" disabled={busy !== null} onClick={onSlett}>
            Slett
          </button>
        )}
      </span>
    </div>
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
  const [eigedomar, setEigedomar] = useState<EigedomTreff[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!kopling) {
    return (
      <div className="card card-pad boligmappa-kort">
        <span className="label">Boligmappa</span>
        <p className="muted tiny" style={{ margin: 0 }}>
          Ikke koblet til.{" "}
          <Link href="/ordre/innstillinger" style={{ textDecoration: "underline" }}>
            Koble til Boligmappa under Innstillinger
          </Link>{" "}
          for å sende dokumentasjonen dit. Alt annet fungerer uten.
        </p>
      </div>
    );
  }

  async function sok() {
    setBusy(true);
    setError(null);
    setEigedomar(null);
    try {
      const res = await fetch(`/api/boligmappa/sok?q=${encodeURIComponent(q)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Søket feilet");
      setAdresser(payload.adresser ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
          <Link href="/ordre/innstillinger" style={{ textDecoration: "underline" }}>
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
              <span className="tiny muted">Slås opp én gang per ordre. Adressen på ordren er fylt inn.</span>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sok();
                }}
              >
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bjørkevegen 22 Bergen" style={{ flex: 1 }} autoFocus />
                <button className="button" type="submit" disabled={busy || q.trim().length < 3}>
                  {busy ? "Søker…" : "Søk"}
                </button>
                <button type="button" className="button ghost" onClick={() => setOpen(false)}>
                  Avbryt
                </button>
              </form>
              {adresser && !eigedomar && (
                <div className="lead-list boligmappa-treff">
                  {adresser.length === 0 && <div className="empty">Ingen treff. Prøv gatenavn, nummer og sted.</div>}
                  {adresser.map((a) => (
                    <button key={a.id} type="button" className="ordre-velger-rad" disabled={busy} onClick={() => velgAdresse(a)}>
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

function formatDag(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
