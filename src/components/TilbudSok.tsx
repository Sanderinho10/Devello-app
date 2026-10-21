"use client";

import { useEffect, useRef, useState } from "react";
import type { TilbudForslag } from "@/app/api/drafts/sok/route";

export type { TilbudForslag };

/**
 * Tilbudsfelt med forslag: skriv tilbudsnummeret eller kundens navn, og
 * tilbudene som passer kommer under feltet. Samme oppførsel som KundeSok —
 * piltaster, Enter velger, Esc lukker. Feltet styres utenfra, så skjemaet
 * kan sette tilbudsnummeret inn når et tilbud er valgt.
 */
export function TilbudSok({
  value: verdi,
  onChange,
  onVelg,
  placeholder,
}: {
  value: string;
  onChange: (tekst: string) => void;
  onVelg: (tilbud: TilbudForslag) => void;
  placeholder?: string;
}) {
  const [forslag, setForslag] = useState<TilbudForslag[]>([]);
  const [open, setOpen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const sist = useRef("");
  const rot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = verdi.trim();
    if (q.length < 1 || !open) {
      setForslag([]);
      return;
    }
    const t = setTimeout(async () => {
      sist.current = q;
      try {
        const res = await fetch(`/api/drafts/sok?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as { tilbud: TilbudForslag[] };
        // Et tregt svar på et gammelt søkeord skal ikke skrive over det nye.
        if (sist.current !== q) return;
        setForslag(payload.tilbud);
        setAktiv(0);
      } catch {
        // Uten forslag kan ordren fortsatt lages uten tilbud.
      }
    }, 180);
    return () => clearTimeout(t);
  }, [verdi, open]);

  useEffect(() => {
    if (!open) return;
    function lukk(e: MouseEvent) {
      if (!rot.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", lukk);
    return () => document.removeEventListener("mousedown", lukk);
  }, [open]);

  function velg(t: TilbudForslag) {
    onVelg(t);
    setOpen(false);
    setForslag([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || forslag.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAktiv((a) => (a + 1) % forslag.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((a) => (a - 1 + forslag.length) % forslag.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      velg(forslag[aktiv]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  }

  const vis = open && forslag.length > 0;

  return (
    <div className="picker" ref={rot}>
      <input
        className="input"
        value={verdi}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={vis}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {vis && (
        <div className="picker-panel" role="listbox">
          {forslag.map((t, i) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={i === aktiv}
              className={`picker-option tilbud-valg${i === aktiv ? " active" : ""}`}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => velg(t)}
            >
              <span className="picker-name">
                <span className="muted">Tilbud {t.quote_no} · </span>
                {t.tittel}
              </span>
              <span className="picker-description">
                {[
                  t.kunde,
                  t.ordre ? `har ordre #${t.ordre.order_no}` : t.bekreftet ? (t.sendt ? "sendt" : "bekreftet") : "ikke bekreftet",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
