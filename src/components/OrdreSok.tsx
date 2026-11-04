"use client";

import { useEffect, useRef, useState } from "react";

export interface OrdreValg {
  id: string;
  order_no: number;
  title: string;
  customer_name: string;
  site_address: string | null;
}

/**
 * Ordrefelt med forslag: skriv ordrenummeret, tittelen eller kunden, og de
 * aktive ordrene som passer kommer under feltet. Piltaster, Enter velger,
 * Esc lukker — som TilbudSok. Bruker samme søk som montørappen.
 */
export function OrdreSok({
  value: verdi,
  onChange,
  onVelg,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (tekst: string) => void;
  onVelg: (ordre: OrdreValg) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [forslag, setForslag] = useState<OrdreValg[]>([]);
  const [open, setOpen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const sist = useRef("");
  const rot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setForslag([]);
      return;
    }
    const q = verdi.trim();
    const t = setTimeout(async () => {
      sist.current = q;
      try {
        const res = await fetch(`/api/app/ordrar?status=aktive&limit=8&q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as { ordrar: OrdreValg[] };
        // Et tregt svar på et gammelt søkeord skal ikke skrive over det nye.
        if (sist.current !== q) return;
        setForslag(payload.ordrar);
        setAktiv(0);
      } catch {
        // Uten forslag kan man prøve igjen.
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

  function velg(o: OrdreValg) {
    onVelg(o);
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
        autoFocus={autoFocus}
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
          {forslag.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={i === aktiv}
              className={`picker-option${i === aktiv ? " active" : ""}`}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => velg(o)}
            >
              <span className="picker-name">
                <span className="muted">#{o.order_no} · </span>
                {o.title}
              </span>
              <span className="picker-description">
                {[o.customer_name, o.site_address].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
