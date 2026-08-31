"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sende tilbudet selv, uten Outlook.
 *
 * Alt som skal til for å få tilbudet av gårde fra hvilken som helst e-post:
 * mottakeren, emnet, teksten og PDF-en. Ingenting av det er nytt — det er det
 * samme som ville gått i Outlook-kladden — men her må det ut av skjermen og
 * inn i et annet program, så hvert felt har sin egen kopiknapp.
 *
 * PDF-en kan dras rett inn i e-posten. Chrome og Edge støtter det gjennom
 * DownloadURL på dra-hendelsen; Firefox og Safari gjør ikke det, og derfor
 * står nedlastingsknappen ved siden av og ikke i stedet.
 *
 * Kryss ut, og ingenting er skjedd: utkastet står som før og kan endres.
 * «Fullført» er det eneste som låser.
 */
export function SendSjolv({
  draftId,
  mottaker,
  mottakerNavn,
  emne,
  tekst,
  harPdf,
  outlookFeil,
  onFullfoert,
  onLukk,
}: {
  draftId: string;
  mottaker: string | null;
  mottakerNavn: string | null;
  emne: string;
  tekst: string;
  harPdf: boolean;
  /** Satt når koblingen finnes, men kladden likevel ikke ble laget. */
  outlookFeil: string | null;
  onFullfoert: () => void;
  onLukk: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFeil, setPdfFeil] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const filnavn = `${reint(emne) || "tilbud"}.pdf`;

  // PDF-en hentes én gang og holdes som blob. Dra-ut trenger en url som ligger
  // klar i det dra-hendelsen starter — å hente den der ville vært for sent.
  useEffect(() => {
    if (!harPdf) return;
    let avbrutt = false;
    let url: string | null = null;

    (async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}/pdf`);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? `Kunne ikke hente PDF (${res.status})`);
        }
        url = URL.createObjectURL(await res.blob());
        if (avbrutt) {
          URL.revokeObjectURL(url);
          return;
        }
        setPdfUrl(url);
      } catch (err) {
        if (!avbrutt) setPdfFeil(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      avbrutt = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [draftId, harPdf]);

  // Escape lukker, som et kryss. Vinduet låser ingenting, så det skal være
  // like lett å komme ut av som inn i.
  useEffect(() => {
    function taste(event: KeyboardEvent) {
      if (event.key === "Escape") onLukk();
    }
    window.addEventListener("keydown", taste);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", taste);
  }, [onLukk]);

  async function kopier(felt: string, verdi: string) {
    try {
      await navigator.clipboard.writeText(verdi);
      setKopiert(felt);
      window.setTimeout(() => setKopiert((n) => (n === felt ? null : n)), 1800);
    } catch {
      setError("Nettleseren lot oss ikke kopiere. Merk teksten og kopier selv.");
    }
  }

  async function fullfoer() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draftId}/sendt`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke markere som sendt");
      onFullfoert();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-bakgrunn" onMouseDown={onLukk}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-label="Send tilbudet selv"
        tabIndex={-1}
        ref={dialog}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="card-header row-between">
          <div>
            <strong>Send tilbudet selv</strong>
            <div className="tiny muted">
              {outlookFeil
                ? "Kladden kunne ikke legges i Outlook denne gangen."
                : "Ingen postkasse er koblet til, så kladden ble ikke lagt i Outlook."}
            </div>
          </div>
          <button className="modal-lukk" onClick={onLukk} aria-label="Lukk">
            ✕
          </button>
        </div>

        <div className="card-pad">
          {outlookFeil && (
            <div className="banner warning" style={{ marginBottom: 16 }}>
              {outlookFeil}
            </div>
          )}
          {error && (
            <div className="banner error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          <Felt
            etikett="Mottaker"
            verdi={mottaker ?? ""}
            tom="Leadet har ingen e-postadresse — finn den selv."
            kopiert={kopiert === "mottaker"}
            kopier={() => kopier("mottaker", mottaker ?? "")}
            hint={mottakerNavn ?? undefined}
          />

          <Felt
            etikett="Emne"
            verdi={emne}
            kopiert={kopiert === "emne"}
            kopier={() => kopier("emne", emne)}
          />

          <div className="field">
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="label" style={{ marginBottom: 0 }}>
                E-posttekst
              </span>
              <button className="button ghost" onClick={() => kopier("tekst", tekst)}>
                {kopiert === "tekst" ? "Kopiert ✓" : "Kopier"}
              </button>
            </div>
            <textarea className="textarea" readOnly value={tekst} style={{ minHeight: 150 }} />
          </div>

          {harPdf && (
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="label">PDF</span>
              {pdfFeil ? (
                <div className="banner error">{pdfFeil}</div>
              ) : !pdfUrl ? (
                <div className="drop" style={{ cursor: "default" }}>
                  <span className="drop-icon">▦</span>
                  <span>Lager PDF…</span>
                </div>
              ) : (
                <div className="file-row">
                  <span
                    className="pdf-dra"
                    draggable
                    onDragStart={(event) => {
                      // Chrome og Edge leser dette og lager fila når den
                      // slippes. Nettlesere som ikke støtter det, ignorerer
                      // linja — og da står nedlastingsknappen ved siden av.
                      event.dataTransfer.setData(
                        "DownloadURL",
                        `application/pdf:${filnavn}:${pdfUrl}`,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    title="Dra fila inn i e-posten"
                  >
                    📄 {filnavn}
                  </span>
                  <span className="file-row-name tiny muted">
                    Dra fila rett inn i e-posten
                  </span>
                  <a className="button ghost" href={pdfUrl} download={filnavn}>
                    Last ned
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-fot">
          <span className="muted tiny">
            Lukker du vinduet, står utkastet som før og kan endres.
          </span>
          <span className="spacer" />
          <button className="button" onClick={fullfoer} disabled={busy}>
            {busy ? "Lagrer…" : "Tilbudet er sendt"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Felt({
  etikett,
  verdi,
  tom,
  hint,
  kopiert,
  kopier,
}: {
  etikett: string;
  verdi: string;
  tom?: string;
  hint?: string;
  kopiert: boolean;
  kopier: () => void;
}) {
  return (
    <div className="field">
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          {etikett}
        </span>
        {verdi && (
          <button className="button ghost" onClick={kopier}>
            {kopiert ? "Kopiert ✓" : "Kopier"}
          </button>
        )}
      </div>
      {verdi ? (
        <input className="input" readOnly value={verdi} onFocus={(e) => e.target.select()} />
      ) : (
        <div className="banner warning">{tom}</div>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/** Filnavn uten tegn som Windows og macOS ikke vil ha. */
function reint(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80);
}
