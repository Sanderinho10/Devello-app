"use client";

import { useRef, useState } from "react";

const ACCEPT = ".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Filvelger med dra-og-slipp. Begge veier inn til samme tilstand — folk gjør
 * det ulikt, og en fil som ligger i en mappe blir like ofte dradd som åpnet.
 */
export function ExcelDrop({
  file,
  onFile,
  templateHref,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  templateHref: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    setRejected(null);
    if (!candidate) return;
    if (!/\.(xlsx|xlsm)$/i.test(candidate.name)) {
      setRejected(
        `«${candidate.name}» er ikke en .xlsx-fil. Er det en gammel .xls eller en CSV, åpne den i Excel og lagre som .xlsx.`,
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
          accept(event.dataTransfer.files[0]);
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
        aria-label="Velg eller dra inn en Excel-fil"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(event) => accept(event.target.files?.[0])}
        />

        {file ? (
          <>
            <span className="drop-icon">▦</span>
            <span>
              <strong>{file.name}</strong>
              <span className="tiny muted"> · {Math.max(1, Math.round(file.size / 1024))} kB</span>
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
              Dra inn Excel-filen, eller <span className="drop-link">velg en fil</span>
            </span>
          </>
        )}
      </div>

      {rejected && (
        <div className="banner error" style={{ marginTop: 10 }}>
          {rejected}
        </div>
      )}

      <p className="hint">
        Kolonnene må hete <strong>Navn</strong>, <strong>Enhet</strong> og{" "}
        <strong>Pris eks. mva</strong>. Kode og beskrivelse er valgfrie.{" "}
        <a href={templateHref} className="drop-link">
          Last ned malen
        </a>{" "}
        om du vil starte fra et ferdig oppsett.
      </p>
    </div>
  );
}
