"use client";

import { FileDrop } from "./FileDrop";

const ACCEPT =
  ".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Prisfil-varianten av FileDrop: Excel, med lenke til malen. */
export function ExcelDrop({
  file,
  onFile,
  templateHref,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  templateHref: string;
}) {
  return (
    <FileDrop
      file={file}
      onFile={onFile}
      extensions={["xlsx", "xlsm"]}
      accept={ACCEPT}
      label="Dra inn Excel-filen, eller"
      rejectHint="Er det en gammel .xls eller en CSV, åpne den i Excel og lagre som .xlsx."
    >
      <p className="hint">
        Kolonnene må hete <strong>Navn</strong>, <strong>Enhet</strong> og{" "}
        <strong>Pris eks. mva</strong>. Kode og beskrivelse er valgfrie.{" "}
        <a href={templateHref} className="drop-link">
          Last ned malen
        </a>{" "}
        om du vil starte fra et ferdig oppsett.
      </p>
      <p className="hint">
        Limer du inn fra en eksisterende prisfil, bruk{" "}
        <strong>Lim inn spesial → Verdier</strong>. Vanlig liming drar med seg
        sammenslåtte celler, og da havner samme pris på flere rader.
      </p>
    </FileDrop>
  );
}
