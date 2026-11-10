"use client";

import { useEffect, useRef, useState } from "react";
import type { HistorikkPost } from "@/lib/aktivitet";
import { formatDate } from "@/lib/types";

/**
 * Klokke-knappen med antall, øverst til høyre på tilbud, ordre og faktura.
 * Et trykk viser hvem som gjorde hva, nyeste først.
 *
 * Bevisst enkel: ingen filtre og ingen detaljer. Spørsmålet den svarer på er
 * «hvem sendte dette?» eller «hvem godkjente fakturaen?».
 */
export function Historikk({ poster, tittel = "Historikk" }: { poster: HistorikkPost[]; tittel?: string }) {
  const [apen, setApen] = useState(false);
  const rot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apen) return;
    const lukkVedKlikk = (e: MouseEvent) => {
      if (rot.current && !rot.current.contains(e.target as Node)) setApen(false);
    };
    const lukkVedEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setApen(false);
    };
    document.addEventListener("mousedown", lukkVedKlikk);
    document.addEventListener("keydown", lukkVedEsc);
    return () => {
      document.removeEventListener("mousedown", lukkVedKlikk);
      document.removeEventListener("keydown", lukkVedEsc);
    };
  }, [apen]);

  return (
    <div className="historikk" ref={rot}>
      <button
        type="button"
        className="historikk-knapp"
        onClick={() => setApen((a) => !a)}
        aria-expanded={apen}
        aria-label={`${tittel}: ${poster.length} ${poster.length === 1 ? "hendelse" : "hendelser"}`}
        title={tittel}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span className="historikk-antall">{poster.length}</span>
      </button>

      {apen && (
        <div className="historikk-panel" role="dialog" aria-label={tittel}>
          <div className="inquiry-head">{tittel}</div>
          {poster.length === 0 ? (
            <p className="muted tiny" style={{ margin: 0 }}>
              Ingenting registrert ennå.
            </p>
          ) : (
            <ol className="historikk-liste">
              {poster.map((p) => (
                <li key={p.id}>
                  <div className="historikk-tekst">{p.tekst}</div>
                  <div className="historikk-meta">
                    {p.navn ? `${p.navn} · ` : ""}
                    {formatDate(p.tid)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
