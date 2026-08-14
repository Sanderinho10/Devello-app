"use client";

import { useRef, useState } from "react";

/**
 * Filvelger med dra-og-slipp. Begge veier inn til samme tilstand — folk gjør
 * det ulikt, og en fil som ligger i en mappe blir like ofte dradd som åpnet.
 *
 * Generisk med vilje: hvilke filtyper som godtas er en parameter, ikke bygget
 * inn. Prisfilen tar imot Excel, referansefilene tar imot PDF og Word, og begge
 * skal oppføre seg likt.
 */
export function FileDrop({
  file,
  onFile,
  extensions,
  accept,
  label = "Dra inn filen, eller",
  rejectHint,
  autoFocus,
  children,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  /** Godtatte endelser uten punktum, f.eks. ["pdf", "docx"]. */
  extensions: string[];
  /** accept-attributtet på input-feltet. */
  accept: string;
  label?: string;
  /** Råd som blir lagt til når en fil blir avvist — hva brukeren kan gjøre. */
  rejectHint?: string;
  /** Ta fokus ved montering. Brukt i popupen, så fokus ikke havner på lukkekrysset. */
  autoFocus?: boolean;
  /** Hjelpetekst under feltet. */
  children?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const pattern = new RegExp(`\\.(${extensions.join("|")})$`, "i");

  function accepted(candidate: File | undefined) {
    setRejected(null);
    if (!candidate) return;
    if (!pattern.test(candidate.name)) {
      setRejected(
        `«${candidate.name}» er ikke en ${listExtensions(extensions)}-fil.` +
          (rejectHint ? ` ${rejectHint}` : ""),
      );
      return;
    }
    onFile(candidate);
  }

  return (
    <div>
      <div
        className={`drop${over ? " over" : ""}${file ? " has-file" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accepted(event.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        autoFocus={autoFocus}
        aria-label="Velg eller dra inn en fil"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => accepted(event.target.files?.[0])}
        />

        {file ? (
          <>
            <span className="drop-icon">▦</span>
            <span>
              <strong>{file.name}</strong>
              <span className="tiny muted">
                {" "}
                · {Math.max(1, Math.round(file.size / 1024))} kB
              </span>
            </span>
            <button
              type="button"
              className="button ghost"
              onClick={(event) => {
                event.stopPropagation();
                onFile(null);
                setRejected(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Fjern
            </button>
          </>
        ) : (
          <>
            <span className="drop-icon">▦</span>
            <span>
              {label} <span className="drop-link">velg en fil</span>
            </span>
          </>
        )}
      </div>

      {rejected && (
        <div className="banner error" style={{ marginTop: 10 }}>
          {rejected}
        </div>
      )}

      {children}
    </div>
  );
}

/** «PDF, Word eller .docx» leser bedre enn en kommaliste med punktum. */
function listExtensions(extensions: string[]): string {
  const shown = extensions.map((ext) => `.${ext}`);
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} eller ${shown[shown.length - 1]}`;
}
