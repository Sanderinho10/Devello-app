"use client";

import { useEffect, useRef, useState } from "react";

/** Det skjemaene trenger av en kunde for å fylle seg selv ut. */
export interface KundeForslag {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

/**
 * Kundefelt med forslag fra kunderegisteret.
 *
 * Skriver man to tegn, kommer kundene som passer under feltet. Velger man
 * en, fyller skjemaet ut resten selv og husker hvem det var — så ordren
 * eller tilbudet kobles til riktig kunde uten å gjette på e-post. Skriver
 * man videre, slippes valget: da er det en ny kunde, eller en som skal
 * stå med andre opplysninger denne gangen.
 */
export function KundeSok({
  value,
  onChange,
  onVelg,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (tekst: string) => void;
  onVelg: (kunde: KundeForslag) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [forslag, setForslag] = useState<KundeForslag[]>([]);
  const [open, setOpen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const sist = useRef("");
  const rot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || !open) {
      setForslag([]);
      return;
    }
    const t = setTimeout(async () => {
      sist.current = q;
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const payload = (await res.json()) as { kunder: KundeForslag[] };
        // Et tregt svar på et gammelt søkeord skal ikke skrive over det nye.
        if (sist.current !== q) return;
        setForslag(payload.kunder);
        setAktiv(0);
      } catch {
        // Forslag er en bekvemmelighet; uten dem fungerer skjemaet som før.
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value, open]);

  // Klikk utenfor lukker listen.
  useEffect(() => {
    if (!open) return;
    function lukk(e: MouseEvent) {
      if (!rot.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", lukk);
    return () => document.removeEventListener("mousedown", lukk);
  }, [open]);

  function velg(kunde: KundeForslag) {
    onVelg(kunde);
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
      setOpen(false);
    }
  }

  const vis = open && forslag.length > 0;

  return (
    <div className="picker" ref={rot}>
      <input
        className="input"
        value={value}
        autoFocus={autoFocus}
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
          {forslag.map((k, i) => (
            <button
              key={k.id}
              type="button"
              role="option"
              aria-selected={i === aktiv}
              className={`picker-option${i === aktiv ? " active" : ""}`}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => velg(k)}
            >
              <span className="picker-name">{k.name}</span>
              <span className="picker-description">
                {[k.contact, k.email, k.phone].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
