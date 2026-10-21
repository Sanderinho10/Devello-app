"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GrossistSok } from "@/components/GrossistSok";
import { Modal } from "@/components/Modal";
import {
  IMPORT_JOB_SOURCE_LABELS,
  IMPORT_JOB_STATUS_LABELS,
  formatDate,
  type ImportJob,
  type Supplier,
  type SupplierFtpPublic,
  type SupplierInvoiceFile,
} from "@/lib/types";
import { GrossistDialog, formatStorleik } from "./GrossistDialog";

export type GrossistRadData = {
  grossist: Supplier;
  aktiveVarer: number;
  ftp: SupplierFtpPublic | null;
  jobbar: ImportJob[];
  fakturafiler: SupplierInvoiceFile[];
};

/**
 * Grossistene som en liste, som i Go. Verktøylinja har «Ny grossist» til
 * venstre og katalogsøket til høyre. Et klikk på raden åpner grossisten i
 * popupen; «Historikk» viser importene og fakturafilene.
 */
export function GrossistListe({
  rader,
  erAdmin,
}: {
  rader: GrossistRadData[];
  erAdmin: boolean;
}) {
  const [ny, setNy] = useState(false);
  const [endre, setEndre] = useState<string | null>(null);
  const [historikk, setHistorikk] = useState<string | null>(null);
  // Importen som går nå, per grossist. Radene poller og melder inn hit.
  const [liveAv, setLiveAv] = useState<Record<string, ImportJob | null>>({});
  const settLive = useCallback(
    (id: string, j: ImportJob | null) =>
      setLiveAv((m) => (m[id] === j ? m : { ...m, [id]: j })),
    [],
  );
  const valgt = rader.find((r) => r.grossist.id === endre) ?? null;
  const vist = rader.find((r) => r.grossist.id === historikk) ?? null;

  return (
    <>
      <div className="verktoylinje">
        {erAdmin && (
          <button type="button" className="button" onClick={() => setNy(true)}>
            Ny grossist
          </button>
        )}
        <div className="verktoylinje-hoyre">
          <GrossistSok placeholder="Slå opp i katalogen — navn eller elnummer" />
        </div>
      </div>

      {rader.length === 0 ? (
        <div className="card empty">
          <div className="empty-title">Ingen grossister ennå</div>
          <div>
            {erAdmin
              ? "Trykk «Ny grossist», og sett opp FTP-henting eller last opp prisfila."
              : "En administrator legger til grossisten og prisfila."}
          </div>
        </div>
      ) : (
        <div className="card allow-overflow">
          <div className="tabell-rull">
            <table
              className={`table tabell-mobil grossist-liste${erAdmin ? " klikkbar" : ""}`}
            >
              <thead>
                <tr>
                  <th>Grossist</th>
                  <th>Kundenr.</th>
                  <th className="num">Aktive varer</th>
                  <th>Henting</th>
                  <th>Siste import</th>
                  <th aria-label="Handlinger" />
                </tr>
              </thead>
              <tbody>
                {rader.map((r) => (
                  <GrossistRad
                    key={r.grossist.id}
                    {...r}
                    erAdmin={erAdmin}
                    onEndre={() => setEndre(r.grossist.id)}
                    onHistorikk={() => setHistorikk(r.grossist.id)}
                    onLive={settLive}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {erAdmin && (
        <GrossistDialog
          open={ny}
          onClose={() => setNy(false)}
          grossist={null}
          ftp={null}
          live={null}
        />
      )}
      {erAdmin && (
        <GrossistDialog
          open={valgt !== null}
          onClose={() => setEndre(null)}
          grossist={valgt?.grossist ?? null}
          ftp={valgt?.ftp ?? null}
          live={valgt ? (liveAv[valgt.grossist.id] ?? null) : null}
        />
      )}
      {vist && (
        <Historikk
          open
          onClose={() => setHistorikk(null)}
          grossist={vist.grossist}
          jobbar={vist.jobbar.map((j) => {
            const l = liveAv[vist.grossist.id];
            return l && l.id === j.id ? l : j;
          })}
          fakturafiler={vist.fakturafiler}
          visFakturafiler={
            Boolean(vist.ftp?.fakturafil_pattern) ||
            vist.fakturafiler.length > 0
          }
        />
      )}
    </>
  );
}

function lever(j: ImportJob): boolean {
  return (
    j.status === "koe" || j.status === "hentar" || j.status === "importerer"
  );
}

/**
 * Én rad. En import som går, polles hvert andre sekund til den er ferdig,
 * og framdriften står i «Siste import».
 */
function GrossistRad({
  grossist,
  aktiveVarer,
  ftp,
  jobbar,
  erAdmin,
  onEndre,
  onHistorikk,
  onLive,
}: GrossistRadData & {
  erAdmin: boolean;
  onEndre: () => void;
  onHistorikk: () => void;
  onLive: (id: string, jobb: ImportJob | null) => void;
}) {
  const router = useRouter();
  const [live, setLive] = useState<ImportJob | null>(
    () => jobbar.find(lever) ?? null,
  );

  // En jobb startet fra popupen kommer inn med neste refresh.
  useEffect(() => {
    const ny = jobbar.find(lever);
    if (ny)
      setLive((forrige) =>
        forrige && forrige.id === ny.id && lever(forrige) ? forrige : ny,
      );
  }, [jobbar]);

  useEffect(() => {
    if (!live || !lever(live)) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/grossist/jobbar/${live.id}`, {
          cache: "no-store",
        });
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

  const gaar = live && lever(live) ? live : null;
  const status = grossist.last_import_status;
  useEffect(() => onLive(grossist.id, gaar), [gaar, grossist.id, onLive]);

  return (
    <tr
      onClick={(event) => {
        if (
          !erAdmin ||
          (event.target as HTMLElement).closest(
            "a, button, input, select, textarea",
          )
        )
          return;
        onEndre();
      }}
    >
      <td className="hoved">
        <strong>{grossist.name}</strong>
      </td>
      <td className="meta">
        <span className="mobil-etikett">Kundenr. </span>
        {grossist.customer_no ?? <span className="muted">—</span>}
      </td>
      <td className="num meta">
        {aktiveVarer.toLocaleString("nb-NO")}
        <span className="mobil-etikett"> varer</span>
      </td>
      <td className="meta">
        {ftp ? (
          <span
            className={`pill ${ftp.auto_import ? "paagaar" : "opna"}`}
            title={ftp.last_fetch_note ?? undefined}
          >
            {ftp.auto_import ? "Hver natt" : "FTP"}
          </span>
        ) : (
          <span className="muted">Manuell</span>
        )}
      </td>
      <td className="meta grossist-siste">
        {gaar ? (
          <JobbFramdrift jobb={gaar} />
        ) : grossist.last_import_at ? (
          <span title={grossist.last_import_note ?? undefined}>
            {status && (
              <span
                className={`pill ${status === "ok" ? "ferdig" : "avbrutt"}`}
                style={{ marginRight: 6 }}
              >
                {status === "ok" ? "OK" : "Feilet"}
              </span>
            )}
            {formatDate(grossist.last_import_at)}
          </span>
        ) : (
          <span className="muted">Ingen import ennå</span>
        )}
      </td>
      <td className="handling">
        <button
          type="button"
          className="button secondary"
          onClick={onHistorikk}
        >
          Historikk
        </button>
      </td>
    </tr>
  );
}

function jobbTekst(jobb: ImportJob): string {
  if (jobb.status === "koe") return "I kø …";
  if (jobb.status === "hentar") return "Henter fila …";
  if (jobb.progress_total && jobb.progress_done >= jobb.progress_total)
    return "Setter rabatter …";
  if (jobb.progress_total)
    return `${jobb.progress_done.toLocaleString("nb-NO")} av ${jobb.progress_total.toLocaleString("nb-NO")}`;
  return "Leser fila …";
}

function JobbFramdrift({ jobb }: { jobb: ImportJob }) {
  const pct =
    jobb.status === "importerer" && jobb.progress_total
      ? Math.round((jobb.progress_done / jobb.progress_total) * 100)
      : null;
  return (
    <span className="grossist-framdrift">
      <span className="tiny">{jobbTekst(jobb)}</span>
      <span className="framdrift">
        <span
          className="framdrift-fyll"
          style={{ width: `${pct ?? (jobb.status === "hentar" ? 5 : 1)}%` }}
        />
      </span>
    </span>
  );
}

function jobbResultat(v: ImportJob): string {
  if (v.status === "feil") return v.error ?? "Feilet";
  if (v.result?.hoppaOver) return "Ingen ny fil";
  if (v.result)
    return `${v.result.aktive.toLocaleString("nb-NO")} varer · ${v.result.nye.toLocaleString("nb-NO")} nye · ${v.result.endra.toLocaleString("nb-NO")} endret · ${v.result.utgaatte.toLocaleString("nb-NO")} utgått · ${v.result.medRabatt.toLocaleString("nb-NO")} med rabatt`;
  if (lever(v)) return jobbTekst(v);
  return "";
}

/** Importene og fakturafilene for én grossist, nyeste først. */
function Historikk({
  open,
  onClose,
  grossist,
  jobbar,
  fakturafiler,
  visFakturafiler,
}: {
  open: boolean;
  onClose: () => void;
  grossist: Supplier;
  jobbar: ImportJob[];
  fakturafiler: SupplierInvoiceFile[];
  visFakturafiler: boolean;
}) {
  const [fane, setFane] = useState<"import" | "fakturafiler">("import");
  useEffect(() => {
    if (open) setFane("import");
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Historikk — ${grossist.name}`}
      size="wide"
    >
      {visFakturafiler && (
        <nav
          className="type-switch kompakt"
          aria-label="Historikk"
          style={{ marginTop: 0, marginBottom: 12 }}
        >
          <button
            type="button"
            className={`type-option${fane === "import" ? " active" : ""}`}
            onClick={() => setFane("import")}
          >
            Prisfil-import<span className="fane-tal">{jobbar.length}</span>
          </button>
          <button
            type="button"
            className={`type-option${fane === "fakturafiler" ? " active" : ""}`}
            onClick={() => setFane("fakturafiler")}
          >
            Fakturafiler<span className="fane-tal">{fakturafiler.length}</span>
          </button>
        </nav>
      )}

      {fane === "import" &&
        (jobbar.length === 0 ? (
          <p className="muted">Ingen importer ennå.</p>
        ) : (
          <div className="tabell-rull">
            <table className="table tabell-mobil historikk-tabell">
              <thead>
                <tr>
                  <th>Tid</th>
                  <th>Status</th>
                  <th>Kilde</th>
                  <th>Fil</th>
                  <th>Resultat</th>
                </tr>
              </thead>
              <tbody>
                {jobbar.map((v) => (
                  <tr key={v.id}>
                    <td className="hoved" style={{ whiteSpace: "nowrap" }}>
                      {formatDate(v.created_at)}
                    </td>
                    <td className="meta">
                      <span
                        className={`pill ${v.status === "ferdig" ? "ferdig" : v.status === "feil" ? "avbrutt" : "paagaar"}`}
                      >
                        {IMPORT_JOB_STATUS_LABELS[v.status]}
                      </span>
                    </td>
                    <td className="meta">
                      {IMPORT_JOB_SOURCE_LABELS[v.source]}
                    </td>
                    <td className="meta tiny">
                      {v.varefil_name ?? "—"}
                      {v.rabattfil_name && ` + ${v.rabattfil_name}`}
                    </td>
                    <td
                      className="meta tiny"
                      title={v.result?.aatvaringar?.join("\n") || undefined}
                    >
                      {jobbResultat(v)}
                      {v.result?.aatvaringar?.length ? (
                        <span className="muted">
                          {" "}
                          · {v.result.aatvaringar.length} advarsler
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {fane === "fakturafiler" &&
        (fakturafiler.length === 0 ? (
          <p className="muted">Ingen fakturafiler hentet ennå.</p>
        ) : (
          <div className="tabell-rull">
            <table className="table tabell-mobil historikk-tabell">
              <thead>
                <tr>
                  <th>Hentet</th>
                  <th>Status</th>
                  <th>Fil</th>
                  <th className="num">Fakturaer</th>
                  <th className="num">Størrelse</th>
                </tr>
              </thead>
              <tbody>
                {fakturafiler.map((f) => (
                  <tr key={f.id}>
                    <td className="hoved" style={{ whiteSpace: "nowrap" }}>
                      {formatDate(f.fetched_at)}
                    </td>
                    <td className="meta">
                      <span
                        className={`pill ${f.status === "lest" ? "ferdig" : f.status === "feil" ? "avbrutt" : f.status === "duplikat" ? "opna" : "paagaar"}`}
                      >
                        {f.status === "lest"
                          ? "Lest"
                          : f.status === "feil"
                            ? "Feil"
                            : f.status === "duplikat"
                              ? "Duplikat"
                              : "Hentet"}
                      </span>
                    </td>
                    <td className="meta tiny">
                      {f.file_name}
                      {f.error && (
                        <span style={{ color: "var(--danger, #b00)" }}>
                          {" "}
                          · {f.error}
                        </span>
                      )}
                    </td>
                    <td className="num meta">
                      {f.status === "lest" ? f.invoice_count : "—"}
                    </td>
                    <td className="num meta tiny">
                      {f.file_size !== null ? formatStorleik(f.file_size) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Lukk
        </button>
      </div>
    </Modal>
  );
}
