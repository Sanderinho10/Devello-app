"use client";

import { useRef, useState } from "react";

const ACCEPT = ".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Filveljar med dra-og-slepp. Begge vegar inn til same tilstand — folk gjer
 * det ulikt, og ei fil som ligg i ei mappe blir like ofte dradd som opna.
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
        `«${candidate.name}» er ikkje ei .xlsx-fil. Er det ei gammal .xls eller ein CSV, opne den i Excel og lagre som .xlsx.`,
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
        aria-label="Vel eller dra inn ei Excel-fil"
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
              Dra inn Excel-fila, eller <span className="drop-link">vel ei fil</span>
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
        Kolonnane må heite <strong>Namn</strong>, <strong>Eining</strong> og{" "}
        <strong>Pris eks. mva</strong>. Kode og skildring er valfrie.{" "}
        <a href={templateHref} className="drop-link">
          Last ned malen
        </a>{" "}
        om du vil starte frå eit ferdig oppsett.
      </p>
    </div>
  );
}
