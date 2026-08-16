"use client";

import { useRef, useState } from "react";

/**
 * Dra-og-slipp for mange filer om gangen.
 *
 * Søsteren til FileDrop, som tar én. Skillet er med vilje: den ene viser fila
 * inni feltet, denne overlater visningen til den som kaller — referansefilene
 * trenger en rad per fil med sitt eget typevalg, og det hører ikke hjemme inni
 * en slippsone.
 *
 * Feltet blir stående etter at filer er valgt, så det går an å slippe inn en
 * bunke til uten å begynne på nytt.
 */
export function MultiFileDrop({
  onFiles,
  extensions,
  accept,
  label,
  rejectHint,
  autoFocus,
}: {
  onFiles: (files: File[]) => void;
  /** Godtatte endelser uten punktum, f.eks. ["pdf", "docx"]. */
  extensions: string[];
  accept: string;
  label: string;
  /** Råd som blir lagt til når filer blir avvist. */
  rejectHint?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const pattern = new RegExp(`\\.(${extensions.join("|")})$`, "i");

  function motta(list: FileList | null) {
    if (!list || list.length === 0) return;
    const godkjent: File[] = [];
    const avvist: string[] = [];

    for (const candidate of Array.from(list)) {
      if (pattern.test(candidate.name)) godkjent.push(candidate);
      else avvist.push(candidate.name);
    }

    // Én dårlig fil i en bunke på tjue skal ikke stoppe de nitten andre —
    // den nevnes, resten går inn.
    setRejected(avvist);
    if (godkjent.length) onFiles(godkjent);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        className={`drop${over ? " over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          motta(event.dataTransfer.files);
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
        aria-label="Velg eller dra inn filer"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={(event) => motta(event.target.files)}
        />
        <span className="drop-icon">▦</span>
        <span>
          {label} <span className="drop-link">velg filer</span>
        </span>
      </div>

      {rejected.length > 0 && (
        <div className="banner error" style={{ marginTop: 10 }}>
          {rejected.length === 1
            ? `«${rejected[0]}» ble hoppet over.`
            : `${rejected.length} filer ble hoppet over: ${rejected.join(", ")}.`}
          {rejectHint ? ` ${rejectHint}` : ""}
        </div>
      )}
    </div>
  );
}
