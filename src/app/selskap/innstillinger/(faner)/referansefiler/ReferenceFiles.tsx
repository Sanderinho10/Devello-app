"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MultiFileDrop } from "@/components/MultiFileDrop";
import { Modal } from "@/components/Modal";
import { MAKS_REFERANSEFILER } from "@/lib/referanser/grense";
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

/**
 * Hvor langt en fil er kommet fra opplastet PDF til noe agenten kan bruke.
 *
 * «Lest» og «i bruk» er ikke det samme: teksten kan ligge i kolonnen uten at
 * fila har kommet inn i den søkbare poolen — og det er poolen genereringen
 * henter fra. Derfor tre tilstander og ikke to.
 */
type Filstatus = "klar" | "lest" | "ulest";

/** En fil i kø for lesing, og hvor langt den er kommet akkurat nå. */
interface Framdrift {
  id: string;
  navn: string;
  tilstand: "venter" | "leser" | "ferdig" | "tom" | "feil";
  melding?: string;
}

export function ReferenceFiles({
  items,
  indekserteIder,
}: {
  items: ReferenceQuote[];
  /** Referansefilene som står i den søkbare poolen. */
  indekserteIder: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kladder, setKladder] = useState<Kladd[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indekserer, setIndekserer] = useState(false);
  const [framdrift, setFramdrift] = useState<Framdrift[] | null>(null);
  const avbryt = useRef(false);

  const indeksert = new Set(indekserteIder);

  function statusFor(item: ReferenceQuote): Filstatus {
    if (!item.extracted_text) return "ulest";
    return indeksert.has(item.id) ? "klar" : "lest";
  }

  /**
   * Filer som ikke er i poolen er usynlige for agenten.
   *
   * De ligger i listen og teller i statistikken, men genereringen leser
   * innholdet fra den søkbare poolen — og dit kommer bare filer som er lest
   * og indeksert. Fjorten opplastede tilbud og et førsteutkast på to poster
   * er nøyaktig slik det ser ut når ingen av dem er det.
   */
  const igjen = items.filter((i) => statusFor(i) !== "klar");
  const ledig = Math.max(0, MAKS_REFERANSEFILER - items.length);
  const fullt = ledig === 0;

  async function indekser() {
    if (igjen.length === 0) return;
    avbryt.current = false;
    setError(null);
    setIndekserer(true);
    setFramdrift(
      igjen.map((fil) => ({
        id: fil.id,
        navn: fil.file_name ?? fil.title,
        tilstand: "venter" as const,
      })),
    );

    // Én fil per kall. Det koster en rundtur ekstra per fil, og gir til
    // gjengjeld en framdrift som er sann — ikke en spinner som står og går
    // mens man lurer på om noe skjer.
    for (const fil of igjen) {
      if (avbryt.current) break;
      sett(fil.id, { tilstand: "leser" });
      try {
        const res = await fetch(`/api/reference-quotes/${fil.id}/les`, {
          method: "POST",
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lese filen");

        if (payload.status === "ingen_tekst") {
          sett(fil.id, {
            tilstand: "tom",
            melding: "Ingen tekst å hente — se om filen åpner som vanlig PDF",
          });
        } else {
          sett(fil.id, { tilstand: "ferdig" });
        }
      } catch (err) {
        sett(fil.id, {
          tilstand: "feil",
          melding: err instanceof Error ? err.message : String(err),
        });
      }
    }

    setIndekserer(false);
    router.refresh();
  }

  function sett(id: string, endring: Partial<Framdrift>) {
    setFramdrift((f) =>
      (f ?? []).map((rad) => (rad.id === id ? { ...rad, ...endring } : rad)),
    );
  }

  function lukkFramdrift() {
    // Lukking under kjøring er et avbrudd, ikke en skjuling: filen som er inne
    // gjøres ferdig, resten står igjen som de var.
    if (indekserer) {
      avbryt.current = true;
      return;
    }
    setFramdrift(null);
  }

  function close() {
    setOpen(false);
    setKladder([]);
    setError(null);
  }

  function leggTil(filer: File[]) {
    // Samme fil to ganger er nesten alltid en glipp — en bunke sluppet inn
    // igjen fordi man ikke så at den kom med første gang.
    const finnes = new Set(kladder.map((k) => `${k.file.name}:${k.file.size}`));
    const nye = filer
      .filter((f) => !finnes.has(`${f.name}:${f.size}`))
      .map((f, i) => ({
        key: `${Date.now()}-${i}-${f.name}`,
        file: f,
        // Arver typen fra forrige rad: en bunke er som regel samme slag.
        type: kladder[kladder.length - 1]?.type ?? ("punktpris" as QuoteType),
        status: "venter" as const,
      }));

    // Taket håndheves på serveren. Her stoppes bunken før den sendes, så en
    // halvveis feilet opplasting ikke er det som forteller om grensen.
    const plass = Math.max(0, MAKS_REFERANSEFILER - items.length - kladder.length);
    setError(
      nye.length <= plass
        ? null
        : plass === 0
          ? `Det er plass til ${MAKS_REFERANSEFILER} referansefiler, og de er brukt. Slett noen først.`
          : `Det er plass til ${plass} ${plass === 1 ? "fil" : "filer"} til. ` +
            `${nye.length - plass} ble ikke lagt til.`,
    );

    setKladder((f) => [...f, ...nye.slice(0, plass)]);
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

  const ferdige = (framdrift ?? []).filter(
    (r) => r.tilstand !== "venter" && r.tilstand !== "leser",
  ).length;

  return (
    <>
      {igjen.length > 0 && (
        <div className="banner warning row-between" style={{ gap: 14 }}>
          <span>
            <strong>
              {igjen.length} {igjen.length === 1 ? "fil er" : "filer er"} ikke lest
              ennå
            </strong>{" "}
            — de ligger her, men agenten kan ikke se innholdet, og de teller
            ikke når utkast lages. Skannede tilbud leses av modellen, og det tar
            noen sekunder per fil.
          </span>
          <button className="button" onClick={indekser} disabled={indekserer}>
            {indekserer ? "Leser filene…" : "Les og indekser"}
          </button>
        </div>
      )}
      {error && !open && <div className="banner error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <strong>
            {items.length} av {MAKS_REFERANSEFILER} filer
          </strong>
          <span className="row" style={{ gap: 10, alignItems: "center" }}>
            {fullt && (
              <span className="tiny muted">
                Grensen er nådd — slett en fil for å få plass til flere.
              </span>
            )}
            <button
              className="button"
              onClick={() => setOpen(true)}
              disabled={fullt}
              title={
                fullt
                  ? `Grensen er ${MAKS_REFERANSEFILER} referansefiler.`
                  : undefined
              }
            >
              Legg til nytt tilbud
            </button>
          </span>
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
                <th style={{ width: 150 }}>Status</th>
                <th style={{ width: 150 }}>Lagt inn</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = statusFor(item);
                return (
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
                    <td>
                      {status === "klar" ? (
                        <span className="pill lest">Lest og indeksert</span>
                      ) : status === "lest" ? (
                        <span className="pill ulest">Lest, ikke indeksert</span>
                      ) : (
                        <span className="pill ulest">Ikke lest</span>
                      )}
                    </td>
                    <td className="muted tiny">{formatDate(item.created_at)}</td>
                    <td>
                      <button className="button danger" onClick={() => remove(item)}>
                        Slett
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={framdrift !== null}
        onClose={lukkFramdrift}
        title={indekserer ? "Leser referansefiler" : "Lesing ferdig"}
      >
        <div className="stack" style={{ gap: 12 }}>
          <div>
            <div className="row-between tiny muted" style={{ marginBottom: 2 }}>
              <span>
                {ferdige} av {(framdrift ?? []).length} filer
              </span>
              {indekserer && <span>Dette tar noen sekunder per fil.</span>}
            </div>
            <div className="forbruk-bar" style={{ marginTop: 0 }}>
              <div
                className="forbruk-fyll"
                style={{
                  width: `${((framdrift ?? []).length ? ferdige / (framdrift ?? []).length : 0) * 100}%`,
                }}
              />
            </div>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            {(framdrift ?? []).map((rad) => (
              <div key={rad.id}>
                <div className="file-row">
                  <span className="drop-icon">▦</span>
                  <span className="file-row-name">
                    <strong>{rad.navn}</strong>
                  </span>
                  {rad.tilstand === "venter" && (
                    <span className="tiny muted">Venter</span>
                  )}
                  {rad.tilstand === "leser" && (
                    <span className="pill genererer">Leser…</span>
                  )}
                  {rad.tilstand === "ferdig" && (
                    <span className="pill lest">Lest og indeksert</span>
                  )}
                  {rad.tilstand === "tom" && (
                    <span className="pill ulest">Ingen tekst</span>
                  )}
                  {rad.tilstand === "feil" && (
                    <span className="pill ulest">Feilet</span>
                  )}
                </div>
                {rad.melding && (
                  <div className="tiny file-row-error">{rad.melding}</div>
                )}
              </div>
            ))}
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={lukkFramdrift}>
              {indekserer ? "Stopp etter denne filen" : "Lukk"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={open} onClose={close} title="Legg til tilbud">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <p className="hint" style={{ marginTop: 0 }}>
            Det er plass til {ledig} {ledig === 1 ? "fil" : "filer"} til av
            {" "}{MAKS_REFERANSEFILER}. Bredde teller mer enn antall — én fil per
            jobbtype gir agenten mer enn ti av samme slag.
          </p>

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
