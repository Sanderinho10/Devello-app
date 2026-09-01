"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MultiFileDrop } from "@/components/MultiFileDrop";
import { Modal } from "@/components/Modal";
import {
  QUOTE_TYPE_LABELS,
  formatDate,
  type QuoteType,
  type ReferenceQuote,
} from "@/lib/types";

const TYPES: QuoteType[] = ["punktpris", "fastpris", "tid_og_materiell"];

const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Referansefilene er en samling filer merket med tilbudstype — ikke noe mer.
 *
 * Tittelen kommer fra filnavnet, så det eneste brukeren må ta stilling til er
 * hvilken type tilbudet var. Alt annet ville vært et skjema å fylle ut.
 */
/** En valgt fil på vei inn, med typen sin og hvor langt den er kommet. */
interface Kladd {
  key: string;
  file: File;
  type: QuoteType;
  status: "venter" | "laster" | "feil";
  error?: string;
}

export function ReferenceFiles({ items }: { items: ReferenceQuote[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kladder, setKladder] = useState<Kladd[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indekserer, setIndekserer] = useState(false);
  const [indeksResultat, setIndeksResultat] = useState<string | null>(null);

  /**
   * Filer uten uthentet tekst er usynlige for agenten.
   *
   * De ligger i listen og teller i statistikken, men genereringen leser
   * innholdet fra den søkbare poolen — og dit kommer bare filer som er lest.
   * Fjorten opplastede tilbud og et førsteutkast på to poster er nøyaktig
   * slik det ser ut når ingen av dem er det.
   */
  const uleste = items.filter((i) => !i.extracted_text).length;

  async function indekser() {
    setIndekserer(true);
    setError(null);
    setIndeksResultat(null);
    try {
      const res = await fetch("/api/reference-quotes/index-all", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lese filene");
      const deler = [
        payload.indexed > 0 ? `${payload.indexed} filer lest og indeksert` : null,
        payload.skipped_no_text > 0
          ? `${payload.skipped_no_text} kunne ikke leses — se om de åpner som vanlig PDF`
          : null,
        (payload.failed ?? []).length > 0 ? `${payload.failed.length} feilet` : null,
      ].filter(Boolean);
      setIndeksResultat(deler.length ? deler.join(" · ") : "Alt var allerede indeksert.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIndekserer(false);
    }
  }

  function close() {
    setOpen(false);
    setKladder([]);
    setError(null);
  }

  function leggTil(filer: File[]) {
    setError(null);
    setKladder((forrige) => {
      // Samme fil to ganger er nesten alltid en glipp — en bunke sluppet inn
      // igjen fordi man ikke så at den kom med første gang.
      const finnes = new Set(forrige.map((k) => `${k.file.name}:${k.file.size}`));
      const nye = filer
        .filter((f) => !finnes.has(`${f.name}:${f.size}`))
        .map((f, i) => ({
          key: `${Date.now()}-${i}-${f.name}`,
          file: f,
          // Arver typen fra forrige rad: en bunke er som regel samme slag.
          type: forrige[forrige.length - 1]?.type ?? ("punktpris" as QuoteType),
          status: "venter" as const,
        }));
      return [...forrige, ...nye];
    });
  }

  function settType(key: string, type: QuoteType) {
    setKladder((f) => f.map((k) => (k.key === key ? { ...k, type } : k)));
  }

  function fjern(key: string) {
    setKladder((f) => f.filter((k) => k.key !== key));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (kladder.length === 0) return;
    setBusy(true);
    setError(null);

    // Én om gangen: serveren henter ut tekst og tagger hver fil, og et titalls
    // parallelle kall ville bare stått i kø hos oss i stedet for hos deg.
    // Til gjengjeld ser du hvilken fil som er inne til enhver tid.
    let feilet = 0;
    for (const kladd of kladder) {
      setKladder((f) =>
        f.map((k) => (k.key === kladd.key ? { ...k, status: "laster" } : k)),
      );
      try {
        const data = new FormData();
        data.set("type", kladd.type);
        data.set("file", kladd.file);

        const res = await fetch("/api/reference-quotes", { method: "POST", body: data });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke laste opp");

        // Ferdige rader forsvinner fra listen — det som står igjen, er det
        // som gjenstår.
        setKladder((f) => f.filter((k) => k.key !== kladd.key));
      } catch (err) {
        feilet++;
        setKladder((f) =>
          f.map((k) =>
            k.key === kladd.key
              ? {
                  ...k,
                  status: "feil",
                  error: err instanceof Error ? err.message : String(err),
                }
              : k,
          ),
        );
      }
    }

    setBusy(false);
    router.refresh();

    if (feilet === 0) {
      close();
    } else {
      setError(
        feilet === 1
          ? "Én fil kom ikke inn. Den står igjen under — prøv igjen eller fjern den."
          : `${feilet} filer kom ikke inn. De står igjen under.`,
      );
    }
  }

  async function remove(item: ReferenceQuote) {
    if (!window.confirm(`Slett «${item.title}»?`)) return;
    await fetch(`/api/reference-quotes?id=${item.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      {uleste > 0 && (
        <div className="banner warning row-between" style={{ gap: 14 }}>
          <span>
            <strong>
              {uleste} {uleste === 1 ? "fil er" : "filer er"} ikke lest ennå
            </strong>{" "}
            — de ligger her, men agenten kan ikke se innholdet, og de teller
            ikke når utkast lages. Skannede tilbud leses av modellen, og det tar
            noen sekunder per fil; blir det mange, trykk igjen når den er ferdig.
          </span>
          <button className="button" onClick={indekser} disabled={indekserer}>
            {indekserer ? "Leser filene…" : "Les og indekser"}
          </button>
        </div>
      )}
      {indeksResultat && <div className="banner success">{indeksResultat}</div>}
      {error && !open && <div className="banner error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <strong>
            {items.length} {items.length === 1 ? "fil" : "filer"}
          </strong>
          <button className="button" onClick={() => setOpen(true)}>
            Legg til nytt tilbud
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen referansefiler ennå</div>
            <div>
              Uten referanser må agenten gjette tilbudstype ut fra omfanget alene.
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fil</th>
                <th style={{ width: 170 }}>Tilbudstype</th>
                <th style={{ width: 150 }}>Lagt inn</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {/* Eldre rader kan mangle fil. Da er navnet bare tekst —
                        en lenke ville gitt 404. */}
                    {item.storage_path ? (
                      <a
                        href={`/api/reference-quotes/${item.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontWeight: 550, textDecoration: "underline" }}
                      >
                        {item.file_name ?? item.title}
                      </a>
                    ) : (
                      <>
                        <span style={{ fontWeight: 550 }}>
                          {item.file_name ?? item.title}
                        </span>
                        <div className="tiny muted">Ingen fil lagret</div>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="pill">{QUOTE_TYPE_LABELS[item.type]}</span>
                  </td>
                  <td className="muted tiny">{formatDate(item.created_at)}</td>
                  <td>
                    <button className="button danger" onClick={() => remove(item)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={close} title="Legg til tilbud">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <div className="field">
            <span className="label">Filer</span>
            <MultiFileDrop
              onFiles={leggTil}
              extensions={["pdf", "doc", "docx"]}
              accept={ACCEPT}
              label="Dra inn tilbudene, eller"
              rejectHint="Vi tar imot PDF og Word."
              autoFocus
            />
          </div>

          {kladder.length > 0 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="label" style={{ margin: 0 }}>
                  {kladder.length} {kladder.length === 1 ? "fil" : "filer"} · velg
                  type per fil
                </span>
                {kladder.length > 1 && (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() =>
                      setKladder((f) => f.map((k) => ({ ...k, type: f[0].type })))
                    }
                  >
                    Bruk øverste type på alle
                  </button>
                )}
              </div>

              <div className="stack" style={{ gap: 6 }}>
                {kladder.map((kladd) => (
                  <div key={kladd.key}>
                    <div className="file-row">
                      <span className="drop-icon">▦</span>
                      <span className="file-row-name">
                        <strong>{kladd.file.name}</strong>
                        <span className="tiny muted">
                          {" "}
                          · {Math.max(1, Math.round(kladd.file.size / 1024))} kB
                        </span>
                      </span>

                      {kladd.status === "laster" ? (
                        <span className="tiny muted">Laster opp…</span>
                      ) : (
                        <>
                          <select
                            className="select"
                            style={{ width: 180 }}
                            value={kladd.type}
                            disabled={busy}
                            onChange={(e) =>
                              settType(kladd.key, e.target.value as QuoteType)
                            }
                          >
                            {TYPES.map((option) => (
                              <option key={option} value={option}>
                                {QUOTE_TYPE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="button ghost"
                            disabled={busy}
                            onClick={() => fjern(kladd.key)}
                          >
                            Fjern
                          </button>
                        </>
                      )}
                    </div>
                    {kladd.error && (
                      <div className="tiny file-row-error">{kladd.error}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || kladder.length === 0}>
              {busy
                ? "Laster opp…"
                : kladder.length > 1
                  ? `Legg til ${kladder.length} filer`
                  : "Legg til"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
