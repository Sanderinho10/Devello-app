"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileDrop } from "@/components/FileDrop";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Leser JSON fra et svar, og gir en lesbar feil når serveren svarte med
 * HTML (innloggingsside, dev-server-feil) i stedet for data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function lesJson(res: Response): Promise<any> {
  const tekst = await res.text();
  try {
    return JSON.parse(tekst);
  } catch {
    const kort = tekst.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(`Serveren svarte ${res.status} med en side i stedet for data. ${res.status === 401 || /logg inn/i.test(kort) ? "Du er trolig logget ut — last siden på nytt." : `Se terminalen der dev-serveren kjører. ${kort}`}`);
  }
}
import {
  IMPORT_JOB_SOURCE_LABELS,
  IMPORT_JOB_STATUS_LABELS,
  formatDate,
  type FtpProtocol,
  type ImportJob,
  type Supplier,
  type SupplierFtpPublic,
} from "@/lib/types";

/**
 * Ett kort per grossist: katalogen, automatisk henting (FTP), opplasting
 * og de siste jobbene. En jobb som lever polles hvert andre sekund til den
 * er ferdig — «Importerer 12 400 av 58 000 …» — og sida oppdateres.
 */
export function GrossistKort({
  grossist,
  aktiveVarer,
  ftp,
  jobbar,
  erAdmin,
}: {
  grossist: Supplier;
  aktiveVarer: number;
  ftp: SupplierFtpPublic | null;
  jobbar: ImportJob[];
  erAdmin: boolean;
}) {
  const router = useRouter();
  const [fane, setFane] = useState<"ftp" | "opplasting" | null>(null);
  const [live, setLive] = useState<ImportJob | null>(jobbar.find((j) => lever(j)) ?? null);

  // Polling mens en jobb lever.
  useEffect(() => {
    if (!live || !lever(live)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/grossist/jobbar/${live.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as ImportJob;
        setLive(j);
        if (!lever(j)) router.refresh();
      } catch {
        /* neste runde */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [live, router]);

  const status = grossist.last_import_status;

  return (
    <div className="card card-pad grossist-kort">
      <div className="row-between" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{grossist.name}</strong>
          <div className="tiny muted">
            {grossist.customer_no ? `Kundenr. ${grossist.customer_no}` : "Kundenummer mangler"}
            {" · "}
            {aktiveVarer.toLocaleString("nb-NO")} aktive varer
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            {grossist.last_import_at
              ? `Siste import ${formatDate(grossist.last_import_at)}${grossist.last_import_note ? ` — ${grossist.last_import_note}` : ""}`
              : "Ingen import ennå"}
          </div>
        </div>
        <span className="row" style={{ flexWrap: "wrap" }}>
          {status && (
            <span className={`pill ${status === "ok" ? "ferdig" : "avbrutt"}`}>{status === "ok" ? "Importert" : "Import feilet"}</span>
          )}
          {ftp && (
            <span className={`pill ${ftp.auto_import ? "paagaar" : "opna"}`} title={ftp.last_fetch_note ?? undefined}>
              {ftp.auto_import ? "Hentes hver natt" : "FTP satt opp"}
            </span>
          )}
          {erAdmin && (
            <>
              <button type="button" className={`button ${fane === "ftp" ? "" : "secondary"}`} onClick={() => setFane(fane === "ftp" ? null : "ftp")}>
                Automatisk henting
              </button>
              <button
                type="button"
                className={`button ${fane === "opplasting" ? "" : "secondary"}`}
                onClick={() => setFane(fane === "opplasting" ? null : "opplasting")}
              >
                Last opp fil
              </button>
            </>
          )}
        </span>
      </div>

      {live && lever(live) && <JobbStatus jobb={live} />}

      {fane === "ftp" && erAdmin && (
        <FtpDel grossist={grossist} ftp={ftp} live={live && lever(live) ? live : null} onJobb={(j) => setLive(j)} />
      )}
      {fane === "opplasting" && erAdmin && (
        <OpplastingDel grossist={grossist} live={live && lever(live) ? live : null} onJobb={(j) => setLive(j)} />
      )}

      {jobbar.length > 0 && (
        <div className="jobbliste">
          <div className="label" style={{ marginTop: 14 }}>
            Siste importer
          </div>
          {jobbar.map((j) => {
            const v = live && live.id === j.id ? live : j;
            return (
              <div key={v.id} className="jobb-rad">
                <span className={`pill ${v.status === "ferdig" ? "ferdig" : v.status === "feil" ? "avbrutt" : "paagaar"}`}>
                  {IMPORT_JOB_STATUS_LABELS[v.status]}
                </span>
                <span className="tiny muted">
                  {IMPORT_JOB_SOURCE_LABELS[v.source]} · {formatDate(v.created_at)}
                  {v.varefil_name && ` · ${v.varefil_name}`}
                  {v.rabattfil_name && ` + ${v.rabattfil_name}`}
                </span>
                <span className="tiny">
                  {v.status === "feil"
                    ? v.error
                    : v.result?.hoppaOver
                      ? "Ingen ny fil"
                      : v.result
                        ? `${v.result.aktive.toLocaleString("nb-NO")} varer · ${v.result.nye.toLocaleString("nb-NO")} nye · ${v.result.endra.toLocaleString("nb-NO")} endret · ${v.result.utgaatte.toLocaleString("nb-NO")} utgått · ${v.result.medRabatt.toLocaleString("nb-NO")} med rabatt`
                        : v.status === "importerer" && v.progress_total
                          ? `Importerer ${v.progress_done.toLocaleString("nb-NO")} av ${v.progress_total.toLocaleString("nb-NO")} …`
                          : ""}
                </span>
                {v.result?.aatvaringar?.length ? (
                  <span className="tiny muted" title={v.result.aatvaringar.join("\n")}>
                    {v.result.aatvaringar.length} advarsler
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function lever(j: ImportJob): boolean {
  return j.status === "koe" || j.status === "hentar" || j.status === "importerer";
}

function JobbStatus({ jobb }: { jobb: ImportJob }) {
  const tekst =
    jobb.status === "koe"
      ? "I kø …"
      : jobb.status === "hentar"
        ? "Henter fila …"
        : jobb.progress_total && jobb.progress_done >= jobb.progress_total
          ? "Setter rabatter og rydder opp …"
          : jobb.progress_total
            ? `Importerer ${jobb.progress_done.toLocaleString("nb-NO")} av ${jobb.progress_total.toLocaleString("nb-NO")} …`
            : "Leser fila …";
  const pct = jobb.status === "importerer" && jobb.progress_total ? Math.round((jobb.progress_done / jobb.progress_total) * 100) : null;
  return (
    <div className="banner info" style={{ marginTop: 12, marginBottom: 0 }}>
      <div className="row-between">
        <span>{tekst}</span>
        {pct !== null && <span className="tiny">{pct} %</span>}
      </div>
      <div className="framdrift">
        <div className="framdrift-fyll" style={{ width: `${pct ?? (jobb.status === "hentar" ? 5 : 1)}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automatisk henting (FTP)
// ---------------------------------------------------------------------------

function FtpDel({
  grossist,
  ftp,
  live,
  onJobb,
}: {
  grossist: Supplier;
  ftp: SupplierFtpPublic | null;
  live: ImportJob | null;
  onJobb: (j: ImportJob) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    protocol: (ftp?.protocol ?? "ftps") as FtpProtocol,
    host: ftp?.host ?? "",
    port: ftp?.port ? String(ftp.port) : "",
    username: ftp?.username ?? "",
    password: "",
    remote_path: ftp?.remote_path ?? "/",
    varefil_pattern: ftp?.varefil_pattern ?? "V4*",
    rabattfil_pattern: ftp?.rabattfil_pattern ?? "R4*",
    auto_import: ftp?.auto_import ?? true,
  });
  const [busy, setBusy] = useState<null | "lagre" | "test" | "hent">(null);
  const [error, setError] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [liste, setListe] = useState<{ filer: { name: string; size: number; mtime: string | null }[]; villeHenta: { varefil: string | null; rabattfil: string | null } } | null>(null);

  async function lagre(): Promise<boolean> {
    setBusy("lagre");
    setError(null);
    setMelding(null);
    try {
      const res = await fetch(`/api/grossist/${grossist.id}/ftp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setForm((f) => ({ ...f, password: "" }));
      setMelding("Lagret.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!(await lagre())) return;
    setBusy("test");
    setError(null);
    setMelding(null);
    setListe(null);
    try {
      const res = await fetch(`/api/grossist/${grossist.id}/ftp/test`, { method: "POST" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Tilkoblingen feilet");
      setListe(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function hent() {
    if (form.password || !ftp) {
      if (!(await lagre())) return;
    }
    setBusy("hent");
    setError(null);
    setMelding(null);
    try {
      const res = await fetch(`/api/grossist/${grossist.id}/hent`, { method: "POST" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke starte");
      onJobb(payload as ImportJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const sett = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grossist-del">
      <div className="label">Automatisk henting (FTP)</div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Grossisten legger prisfil (V4…) og rabattfil (R4…) på et FTP-område med kundens innlogging. Devello henter
        den nyeste fila som matcher mønsteret. Passordet lagres på serveren og vises aldri igjen.
      </p>
      {error && <div className="banner error">{error}</div>}
      {melding && !error && <div className="banner success">{melding}</div>}
      {ftp?.last_fetch_at && (
        <div className="tiny muted" style={{ marginBottom: 8 }}>
          Sist hentet {formatDate(ftp.last_fetch_at)}
          {ftp.last_fetch_status && ` · ${ftp.last_fetch_status === "ok" ? "ok" : ftp.last_fetch_status === "ingen_ny_fil" ? "ingen ny fil" : "feil"}`}
          {ftp.last_fetch_note && ` — ${ftp.last_fetch_note}`}
        </div>
      )}
      <div className="grid-2">
        <label className="field">
          <span className="label">Protokoll</span>
          <select className="input" value={form.protocol} onChange={(e) => sett("protocol", e.target.value)}>
            <option value="ftps">FTPS (FTP med TLS)</option>
            <option value="ftp">FTP</option>
            <option value="sftp">SFTP (SSH)</option>
          </select>
        </label>
        <label className="field">
          <span className="label">Vert</span>
          <input className="input" value={form.host} onChange={(e) => sett("host", e.target.value)} placeholder="ftp.onninen.no" />
        </label>
        <label className="field">
          <span className="label">Port (tom = standard)</span>
          <input className="input" inputMode="numeric" value={form.port} onChange={(e) => sett("port", e.target.value)} placeholder={form.protocol === "sftp" ? "22" : "21"} />
        </label>
        <label className="field">
          <span className="label">Brukernavn</span>
          <input className="input" value={form.username} onChange={(e) => sett("username", e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span className="label">Passord</span>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => sett("password", e.target.value)}
            placeholder={ftp?.har_passord ? "•••• lagret — skriv nytt for å bytte" : ""}
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span className="label">Katalog</span>
          <input className="input" value={form.remote_path} onChange={(e) => sett("remote_path", e.target.value)} placeholder="/" />
        </label>
        <label className="field">
          <span className="label">Filmønster varefil</span>
          <input className="input" value={form.varefil_pattern} onChange={(e) => sett("varefil_pattern", e.target.value)} placeholder="V4*" />
          <span className="hint">* = hva som helst, ? = ett tegn. Nyeste fil som matcher blir hentet.</span>
        </label>
        <label className="field">
          <span className="label">Filmønster rabattfil (tom = ingen)</span>
          <input className="input" value={form.rabattfil_pattern} onChange={(e) => sett("rabattfil_pattern", e.target.value)} placeholder="R4*" />
        </label>
      </div>
      <label className="row" style={{ gap: 8, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={form.auto_import} onChange={(e) => sett("auto_import", e.target.checked)} />
        <span>Hent automatisk hver natt</span>
      </label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button type="button" className="button" onClick={lagre} disabled={busy !== null}>
          {busy === "lagre" ? "Lagrer…" : "Lagre"}
        </button>
        <button type="button" className="button secondary" onClick={test} disabled={busy !== null || !form.host || !form.username}>
          {busy === "test" ? "Kobler til…" : "Test tilkobling"}
        </button>
        <button type="button" className="button secondary" onClick={hent} disabled={busy !== null || live !== null || (!ftp && !form.password)}>
          {busy === "hent" ? "Starter…" : "Hent nå"}
        </button>
      </div>

      {liste && (
        <div style={{ marginTop: 12 }}>
          <div className="banner success" style={{ marginBottom: 8 }}>
            Tilkoblet. {liste.filer.length} {liste.filer.length === 1 ? "fil" : "filer"} i katalogen.
            {liste.villeHenta.varefil ? ` Ville hentet: ${liste.villeHenta.varefil}` : " Ingen fil matcher varefil-mønsteret."}
            {liste.villeHenta.rabattfil && ` + ${liste.villeHenta.rabattfil}`}
          </div>
          <div className="filliste">
            {liste.filer.slice(0, 30).map((f) => (
              <div key={f.name} className={`fil-rad${f.name === liste.villeHenta.varefil || f.name === liste.villeHenta.rabattfil ? " vald" : ""}`}>
                <span>{f.name}</span>
                <span className="tiny muted">
                  {formatStorleik(f.size)}
                  {f.mtime && ` · ${formatDate(f.mtime)}`}
                </span>
              </div>
            ))}
            {liste.filer.length > 30 && <div className="tiny muted" style={{ padding: 6 }}>… og {liste.filer.length - 30} til</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opplasting
// ---------------------------------------------------------------------------

function OpplastingDel({ grossist, live, onJobb }: { grossist: Supplier; live: ImportJob | null; onJobb: (j: ImportJob) => void }) {
  const [varefil, setVarefil] = useState<File | null>(null);
  const [rabattfil, setRabattfil] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avbryt = useRef(false);

  async function lastOpp() {
    if (!varefil) return;
    setBusy(true);
    setError(null);
    setPct(0);
    try {
      const start = await fetch(`/api/grossist/${grossist.id}/opplasting/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ varefil_name: varefil.name, rabattfil_name: rabattfil?.name ?? null }),
      });
      const s = await lesJson(start);
      if (!start.ok) throw new Error(s.error ?? "Kunne ikke starte opplastingen");

      const supabase = supabaseBrowser();
      const total = varefil.size + (rabattfil?.size ?? 0);
      // Direkte til Storage med signert lenke — aldri gjennom Next.
      const { error: vFeil } = await supabase.storage.from(s.bucket).uploadToSignedUrl(s.varefil.path, s.varefil.token, varefil, { upsert: true });
      if (vFeil) throw new Error(`Opplasting av varefila feilet: ${vFeil.message}`);
      setPct(Math.round((varefil.size / total) * 100));
      if (rabattfil && s.rabattfil) {
        const { error: rFeil } = await supabase.storage.from(s.bucket).uploadToSignedUrl(s.rabattfil.path, s.rabattfil.token, rabattfil, { upsert: true });
        if (rFeil) throw new Error(`Opplasting av rabattfila feilet: ${rFeil.message}`);
      }
      setPct(100);

      const ferdig = await fetch(`/api/grossist/${grossist.id}/opplasting/ferdig`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: s.jobId }),
      });
      const j = await lesJson(ferdig);
      if (!ferdig.ok) throw new Error(j.error ?? "Kunne ikke starte importen");
      onJobb(j as ImportJob);
      setVarefil(null);
      setRabattfil(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setPct(null);
      avbryt.current = false;
    }
  }

  return (
    <div className="grossist-del">
      <div className="label">Last opp prisfil</div>
      <p className="tiny muted" style={{ marginBottom: 10 }}>
        Varefila fra grossisten (V4…, zip eller txt) og eventuelt rabattfila (R4…, txt). Fila går rett til lagringen; importen
        kjører i bakgrunnen etterpå.
      </p>
      {error && <div className="banner error">{error}</div>}
      <div className="grid-2">
        <div>
          <span className="label">Varefil</span>
          <FileDrop file={varefil} onFile={setVarefil} extensions={["zip", "txt"]} accept=".zip,.txt" label="Dra inn V4-fila, eller" />
        </div>
        <div>
          <span className="label">Rabattfil (valgfri)</span>
          <FileDrop file={rabattfil} onFile={setRabattfil} extensions={["txt", "zip"]} accept=".txt,.zip" label="Dra inn R4-fila, eller" />
        </div>
      </div>
      {pct !== null && (
        <div className="framdrift" style={{ marginTop: 10 }}>
          <div className="framdrift-fyll" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="button" onClick={lastOpp} disabled={busy || !varefil || live !== null}>
          {busy ? (pct !== null && pct < 100 ? `Laster opp ${pct} %…` : "Starter import…") : "Last opp og importer"}
        </button>
        {live && <span className="tiny muted">En import pågår — vent til den er ferdig.</span>}
      </div>
    </div>
  );
}

function formatStorleik(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} kB`;
  return `${b} B`;
}
