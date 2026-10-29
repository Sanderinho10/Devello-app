"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileDrop } from "@/components/FileDrop";
import { Modal } from "@/components/Modal";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  formatDate,
  type FtpProtocol,
  type ImportJob,
  type Supplier,
  type SupplierFtpPublic,
} from "@/lib/types";

type Fane = "generelt" | "prisfil" | "fakturafiler" | "opplasting";

const FANER: { id: Fane; etikett: string }[] = [
  { id: "generelt", etikett: "Generelt" },
  { id: "prisfil", etikett: "Prisfil (FTP)" },
  { id: "fakturafiler", etikett: "Fakturafiler" },
  { id: "opplasting", etikett: "Last opp fil" },
];

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
    throw new Error(
      `Serveren svarte ${res.status} med en side i stedet for data. ${
        res.status === 401 || /logg inn/i.test(kort) ? "Du er trolig logget ut — last siden på nytt." : kort
      }`,
    );
  }
}

function tomtSkjema(ftp: SupplierFtpPublic | null) {
  return {
    protocol: (ftp?.protocol ?? "ftps") as FtpProtocol,
    host: ftp?.host ?? "",
    port: ftp?.port ? String(ftp.port) : "",
    username: ftp?.username ?? "",
    password: "",
    remote_path: ftp?.remote_path ?? "/",
    varefil_pattern: ftp?.varefil_pattern ?? "V4*",
    rabattfil_pattern: ftp?.rabattfil_pattern ?? "R4*",
    auto_import: ftp?.auto_import ?? true,
    fakturafil_pattern: ftp?.fakturafil_pattern ?? "",
    fakturafil_path: ftp?.fakturafil_path ?? "",
  };
}

/**
 * Grossisten i én popup, som i Go: sidefaner til venstre, felt med etiketten
 * foran til høyre. Samme popup for «Ny grossist» og for å endre en som
 * finnes, så alt kan fylles inn på en gang — navn, FTP-henting, fakturafiler
 * og prisfila som skal lastes opp.
 *
 * «Opprett» lager grossisten, lagrer FTP-oppsettet om det er fylt inn, og
 * laster opp prisfila om en er valgt. Importen kjører videre i bakgrunnen,
 * og lista viser framdriften.
 */
export function GrossistDialog({
  open,
  onClose,
  grossist,
  ftp,
  live,
  aktiveVarer = 0,
}: {
  open: boolean;
  onClose: () => void;
  /** Tom: ny grossist. */
  grossist: Supplier | null;
  ftp: SupplierFtpPublic | null;
  /** En import som går nå. Da kan det ikke startes en til. */
  live: ImportJob | null;
  /** Varer i katalogen — står i spørsmålet før sletting. */
  aktiveVarer?: number;
}) {
  const router = useRouter();
  const ny = grossist === null;
  const [fane, setFane] = useState<Fane>("generelt");
  const [navn, setNavn] = useState(grossist?.name ?? "");
  const [kundenr, setKundenr] = useState(grossist?.customer_no ?? "");
  const [form, setForm] = useState(() => tomtSkjema(ftp));
  const [varefil, setVarefil] = useState<File | null>(null);
  const [rabattfil, setRabattfil] = useState<File | null>(null);
  const [busy, setBusy] = useState<null | "lagre" | "test" | "hent" | "fakturaer" | "slett">(null);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [liste, setListe] = useState<{
    filer: { name: string; size: number; mtime: string | null }[];
    villeHenta: { varefil: string | null; rabattfil: string | null };
  } | null>(null);

  // Nytt skjema hver gang popupen åpnes — men ikke når router.refresh()
  // gir nye grossist/ftp-objekter mens den er åpen. Da ville fanen hoppet
  // tilbake til «Generelt» og meldingen forsvunnet rett etter et knappetrykk.
  const aapnaFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      aapnaFor.current = null;
      return;
    }
    const id = grossist?.id ?? "ny";
    if (aapnaFor.current === id) return;
    aapnaFor.current = id;
    setFane("generelt");
    setNavn(grossist?.name ?? "");
    setKundenr(grossist?.customer_no ?? "");
    setForm(tomtSkjema(ftp));
    setVarefil(null);
    setRabattfil(null);
    setError(null);
    setMelding(null);
    setListe(null);
    setPct(null);
  }, [open, grossist, ftp]);

  const sett = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const harFtp = Boolean(form.host.trim() || form.username.trim());
  const ftpEndra =
    JSON.stringify({ ...form, password: "" }) !== JSON.stringify({ ...tomtSkjema(ftp), password: "" }) ||
    Boolean(form.password);

  function lukk() {
    if (busy) return;
    onClose();
  }

  async function lagreFtp(id: string) {
    const res = await fetch(`/api/grossist/${id}/ftp`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = await lesJson(res);
    if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre FTP-oppsettet");
    setForm((f) => ({ ...f, password: "" }));
  }

  /** Prisfila rett til lagringen med signert lenke — aldri gjennom Next — og importen startes. */
  async function lastOpp(id: string) {
    if (!varefil) return;
    setPct(0);
    const start = await fetch(`/api/grossist/${id}/opplasting/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ varefil_name: varefil.name, rabattfil_name: rabattfil?.name ?? null }),
    });
    const s = await lesJson(start);
    if (!start.ok) throw new Error(s.error ?? "Kunne ikke starte opplastingen");
    const supabase = supabaseBrowser();
    const total = varefil.size + (rabattfil?.size ?? 0);
    const { error: vFeil } = await supabase.storage
      .from(s.bucket)
      .uploadToSignedUrl(s.varefil.path, s.varefil.token, varefil, { upsert: true });
    if (vFeil) throw new Error(`Opplasting av varefila feilet: ${vFeil.message}`);
    setPct(Math.round((varefil.size / total) * 100));
    if (rabattfil && s.rabattfil) {
      const { error: rFeil } = await supabase.storage
        .from(s.bucket)
        .uploadToSignedUrl(s.rabattfil.path, s.rabattfil.token, rabattfil, { upsert: true });
      if (rFeil) throw new Error(`Opplasting av rabattfila feilet: ${rFeil.message}`);
    }
    setPct(100);
    const ferdig = await fetch(`/api/grossist/${id}/opplasting/ferdig`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: s.jobId }),
    });
    const j = await lesJson(ferdig);
    if (!ferdig.ok) throw new Error(j.error ?? "Kunne ikke starte importen");
  }

  /** Opprett eller lagre: grossisten, så FTP-oppsettet, så prisfila. */
  async function lagre() {
    if (!navn.trim()) {
      setFane("generelt");
      setError("Grossisten må ha et navn.");
      return;
    }
    setBusy("lagre");
    setError(null);
    setMelding(null);
    try {
      let id = grossist?.id ?? null;
      if (ny) {
        const res = await fetch("/api/grossist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: navn, customer_no: kundenr }),
        });
        const payload = await lesJson(res);
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette grossisten");
        id = payload.id as string;
      } else if (navn.trim() !== grossist!.name || (kundenr.trim() || null) !== grossist!.customer_no) {
        const res = await fetch(`/api/grossist/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: navn, customer_no: kundenr }),
        });
        const payload = await lesJson(res);
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      }
      if (harFtp && ftpEndra) {
        try {
          await lagreFtp(id!);
        } catch (err) {
          setFane("prisfil");
          throw err;
        }
      }
      if (varefil) {
        try {
          await lastOpp(id!);
        } catch (err) {
          setFane("opplasting");
          throw err;
        }
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // En ny grossist som ble opprettet før feilen, finnes nå. Lista oppdateres.
      if (ny) router.refresh();
    } finally {
      setBusy(null);
      setPct(null);
    }
  }

  async function test() {
    if (!grossist) return;
    setBusy("test");
    setError(null);
    setMelding(null);
    setListe(null);
    try {
      if (ftpEndra) await lagreFtp(grossist.id);
      const res = await fetch(`/api/grossist/${grossist.id}/ftp/test`, { method: "POST" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Tilkoblingen feilet");
      setListe(payload);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function hentNaa() {
    if (!grossist) return;
    setBusy("hent");
    setError(null);
    setMelding(null);
    try {
      if (ftpEndra) await lagreFtp(grossist.id);
      const res = await fetch(`/api/grossist/${grossist.id}/hent`, { method: "POST" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke starte");
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function hentFakturaer() {
    if (!grossist) return;
    setBusy("fakturaer");
    setError(null);
    setMelding(null);
    try {
      if (ftpEndra) await lagreFtp(grossist.id);
      const res = await fetch(`/api/grossist/${grossist.id}/fakturaer/hent`, { method: "POST" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente fakturaer");
      const r = payload as {
        filer: number;
        nye: number;
        fakturaer: number;
        kopla: number;
        ukopla: number;
        duplikat: number;
        feil: string[];
        notat?: string;
      };
      // Ingen treff: vis hva som ligger i mappa i stedet for bare nuller.
      if (r.filer === 0 && r.feil.length === 0 && r.notat) {
        setMelding(r.notat);
        router.refresh();
        return;
      }
      setMelding(
        `${r.filer} filer på serveren, ${r.nye} nye, ${r.fakturaer} fakturaer, ${r.kopla} koblet, ${r.ukopla} ukoblet` +
          (r.duplikat ? `, ${r.duplikat} duplikat` : "") +
          (r.feil.length ? ` — ${r.feil.length} feil: ${r.feil[0]}` : ""),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function slett() {
    if (!grossist) return;
    const varer = aktiveVarer > 0 ? ` Katalogen med ${aktiveVarer.toLocaleString("nb-NO")} varer slettes også.` : "";
    if (
      !window.confirm(
        `Slette «${grossist.name}»?${varer} FTP-oppsettet og importhistorikken forsvinner.\n\n` +
          "Materiell som alt står på ordrer og leverandørfakturaer blir stående. Dette kan ikke angres.",
      )
    )
      return;
    setBusy("slett");
    setError(null);
    setMelding(null);
    try {
      const res = await fetch(`/api/grossist/${grossist.id}`, { method: "DELETE" });
      const payload = await lesJson(res);
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette grossisten");
      setBusy(null);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  const rad = (etikett: string, felt: React.ReactNode, kort = false) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      {kort ? <span className="kort-felt">{felt}</span> : felt}
    </label>
  );
  const hint = (tekst: React.ReactNode) => (
    <div className="kontakt-rad">
      <span />
      <span className="hint" style={{ marginTop: -4 }}>
        {tekst}
      </span>
    </div>
  );

  return (
    <Modal open={open} onClose={lukk} title={ny ? "Ny grossist" : grossist!.name} size="wide">
      {error && <div className="banner error">{error}</div>}
      {melding && !error && <div className="banner info">{melding}</div>}

      <div className="kontakt-skjema">
        <nav className="kontakt-faner" aria-label="Grossist">
          {FANER.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`kontakt-fane${f.id === fane ? " aktiv" : ""}`}
              onClick={() => setFane(f.id)}
            >
              {f.etikett}
              {f.id === "opplasting" && varefil && <span className="kontakt-fane-tal">1</span>}
            </button>
          ))}
        </nav>

        <div className="kontakt-panel grossist-panel">
          {fane === "generelt" && (
            <>
              {rad(
                "Navn",
                <input className="input" value={navn} onChange={(e) => setNavn(e.target.value)} placeholder="Onninen" autoFocus required />,
              )}
              {rad(
                "Kundenummer",
                <input className="input" value={kundenr} onChange={(e) => setKundenr(e.target.value)} placeholder="Valgfritt" />,
                true,
              )}
              {hint("Vårt kundenummer hos grossisten. Står også i prisfila.")}
              {ny && (
                <p className="hint" style={{ marginTop: 12 }}>
                  Fyll inn FTP-henting under «Prisfil (FTP)», eller last opp prisfila under «Last opp fil». Alt lagres når
                  du trykker «Opprett».
                </p>
              )}
            </>
          )}

          {fane === "prisfil" && (
            <>
              <p className="hint" style={{ margin: "0 0 12px" }}>
                Grossisten legger prisfil (V4…) og rabattfil (R4…) på et FTP-område med kundens innlogging. Devello henter
                den nyeste fila som matcher mønsteret. Passordet lagres på serveren og vises aldri igjen.
              </p>
              {ftp?.last_fetch_at && (
                <p className="tiny muted" style={{ margin: "0 0 10px" }}>
                  Sist hentet {formatDate(ftp.last_fetch_at)}
                  {ftp.last_fetch_status &&
                    ` · ${ftp.last_fetch_status === "ok" ? "ok" : ftp.last_fetch_status === "ingen_ny_fil" ? "ingen ny fil" : "feil"}`}
                  {ftp.last_fetch_note && ` — ${ftp.last_fetch_note}`}
                </p>
              )}
              {rad(
                "Protokoll",
                <select className="input" value={form.protocol} onChange={(e) => sett("protocol", e.target.value)}>
                  <option value="ftps">FTPS (FTP med TLS)</option>
                  <option value="ftp">FTP</option>
                  <option value="sftp">SFTP (SSH)</option>
                </select>,
              )}
              {rad("Vert", <input className="input" value={form.host} onChange={(e) => sett("host", e.target.value)} placeholder="ftp.onninen.no" />)}
              {rad(
                "Port",
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.port}
                  onChange={(e) => sett("port", e.target.value)}
                  placeholder={form.protocol === "sftp" ? "22" : "21"}
                />,
                true,
              )}
              {rad("Brukernavn", <input className="input" value={form.username} onChange={(e) => sett("username", e.target.value)} autoComplete="off" />)}
              {rad(
                "Passord",
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => sett("password", e.target.value)}
                  placeholder={ftp?.har_passord ? "•••• lagret — skriv nytt for å bytte" : ""}
                  autoComplete="new-password"
                />,
              )}
              {rad("Katalog", <input className="input" value={form.remote_path} onChange={(e) => sett("remote_path", e.target.value)} placeholder="/" />)}
              <div className="kontakt-skilje">Filene</div>
              {rad("Varefil", <input className="input" value={form.varefil_pattern} onChange={(e) => sett("varefil_pattern", e.target.value)} placeholder="V4*" />, true)}
              {rad("Rabattfil", <input className="input" value={form.rabattfil_pattern} onChange={(e) => sett("rabattfil_pattern", e.target.value)} placeholder="R4* — tom = ingen" />, true)}
              {hint("* = hva som helst, ? = ett tegn. Nyeste fil som matcher blir hentet.")}
              <div className="kontakt-rad">
                <span />
                <label className="ny-post-lagre">
                  <input type="checkbox" checked={form.auto_import} onChange={(e) => sett("auto_import", e.target.checked)} />
                  <span>Hent automatisk hver natt</span>
                </label>
              </div>

              {!ny && (
                <div className="kontakt-rad" style={{ marginTop: 6 }}>
                  <span />
                  <span className="row" style={{ flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={test}
                      disabled={busy !== null || !form.host || !form.username}
                    >
                      {busy === "test" ? "Kobler til…" : "Test tilkobling"}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={hentNaa}
                      disabled={busy !== null || live !== null || (!ftp && !form.password)}
                      title={live ? "En import pågår — vent til den er ferdig" : undefined}
                    >
                      {busy === "hent" ? "Starter…" : "Hent prisfila nå"}
                    </button>
                  </span>
                </div>
              )}

              {liste && (
                <div style={{ marginTop: 12 }}>
                  <div className="banner success" style={{ marginBottom: 8 }}>
                    Tilkoblet. {liste.filer.length} {liste.filer.length === 1 ? "fil" : "filer"} i katalogen.
                    {liste.villeHenta.varefil ? ` Ville hentet: ${liste.villeHenta.varefil}` : " Ingen fil matcher varefil-mønsteret."}
                    {liste.villeHenta.rabattfil && ` + ${liste.villeHenta.rabattfil}`}
                  </div>
                  <div className="filliste">
                    {liste.filer.slice(0, 30).map((f) => (
                      <div
                        key={f.name}
                        className={`fil-rad${f.name === liste.villeHenta.varefil || f.name === liste.villeHenta.rabattfil ? " vald" : ""}`}
                      >
                        <span>{f.name}</span>
                        <span className="tiny muted">
                          {formatStorleik(f.size)}
                          {f.mtime && ` · ${formatDate(f.mtime)}`}
                        </span>
                      </div>
                    ))}
                    {liste.filer.length > 30 && (
                      <div className="tiny muted" style={{ padding: 6 }}>
                        … og {liste.filer.length - 30} til
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {fane === "fakturafiler" && (
            <>
              <p className="hint" style={{ margin: "0 0 12px" }}>
                Grossisten kan legge fakturaene som filer på samme FTP-konto («autofakt»). Nye filer som matcher mønsteret
                hentes, og linjene legges på ordren montøren skrev på bestillingen — som fra regnskapssystemet.
              </p>
              {ftp?.last_invoice_fetch_at && (
                <p className="tiny muted" style={{ margin: "0 0 10px" }}>
                  Sist hentet {formatDate(ftp.last_invoice_fetch_at)}
                  {ftp.last_invoice_fetch_status &&
                    ` · ${ftp.last_invoice_fetch_status === "ok" ? "ok" : ftp.last_invoice_fetch_status === "ingen_ny_fil" ? "ingen ny fil" : "feil"}`}
                  {ftp.last_invoice_fetch_note && ` — ${ftp.last_invoice_fetch_note}`}
                </p>
              )}
              {rad(
                "Filmønster",
                <input
                  className="input"
                  value={form.fakturafil_pattern}
                  onChange={(e) => sett("fakturafil_pattern", e.target.value)}
                  placeholder="Tom = av"
                />,
              )}
              {hint("Be grossisten om autofakt i formatet EFO/NELFO 4.0 på samme FTP-konto, og spør hva filene heter.")}
              {rad(
                "Katalog",
                <input
                  className="input"
                  value={form.fakturafil_path}
                  onChange={(e) => sett("fakturafil_path", e.target.value)}
                  placeholder={`Tom = samme som prisfila (${form.remote_path || "/"})`}
                />,
              )}
              {!harFtp && hint("Fakturafilene hentes med FTP-innloggingen under «Prisfil (FTP)».")}
              {!ny && (
                <div className="kontakt-rad" style={{ marginTop: 6 }}>
                  <span />
                  <span>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={hentFakturaer}
                      disabled={busy !== null || !form.fakturafil_pattern.trim() || (!ftp && !form.password)}
                    >
                      {busy === "fakturaer" ? "Henter…" : "Hent fakturaer nå"}
                    </button>
                  </span>
                </div>
              )}
            </>
          )}

          {fane === "opplasting" && (
            <>
              <p className="hint" style={{ margin: "0 0 12px" }}>
                Varefila fra grossisten (V4…, zip eller txt) og eventuelt rabattfila (R4…). Fila lastes opp når du trykker
                «{ny ? "Opprett" : "Lagre"}», og importen kjører i bakgrunnen etterpå.
              </p>
              <div className="kontakt-rad topp">
                <span className="kontakt-rad-etikett">Varefil</span>
                <FileDrop file={varefil} onFile={setVarefil} extensions={["zip", "txt"]} accept=".zip,.txt" label="Dra inn V4-fila, eller" />
              </div>
              <div className="kontakt-rad topp">
                <span className="kontakt-rad-etikett">Rabattfil</span>
                <FileDrop file={rabattfil} onFile={setRabattfil} extensions={["txt", "zip"]} accept=".txt,.zip" label="Valgfri — dra inn R4-fila, eller" />
              </div>
              {live && hint("En import pågår — vent til den er ferdig før du laster opp en ny.")}
            </>
          )}
        </div>
      </div>

      {pct !== null && (
        <div className="framdrift" style={{ marginTop: 12 }}>
          <div className="framdrift-fyll" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="modal-actions">
        {!ny && (
          <button
            type="button"
            className="button danger"
            onClick={slett}
            disabled={busy !== null || live !== null}
            title={live ? "En import kjører — vent til den er ferdig." : undefined}
            style={{ marginRight: "auto" }}
          >
            {busy === "slett" ? "Sletter…" : "Slett grossist"}
          </button>
        )}
        <button type="button" className="button secondary" onClick={lukk} disabled={busy !== null}>
          Avbryt
        </button>
        <button
          type="button"
          className="button"
          onClick={lagre}
          disabled={busy !== null || !navn.trim() || (Boolean(varefil) && live !== null)}
        >
          {busy === "lagre"
            ? pct !== null && pct < 100
              ? `Laster opp ${pct} %…`
              : ny
                ? "Oppretter…"
                : "Lagrer…"
            : ny
              ? "Opprett"
              : "Lagre"}
        </button>
      </div>
    </Modal>
  );
}

export function formatStorleik(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} kB`;
  return `${b} B`;
}
