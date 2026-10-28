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
  /** Hovedadressen felt for felt, til skjemaer med adressefelt som i Go. */
  adresse?: { linje1: string; linje2: string; postnr: string; sted: string };
  /** Kundenummeret i regnskapssystemet, når kunden er overført dit. */
  kode?: string | null;
  /** Kundenummeret i Devello (0057). */
  customer_no?: number | null;
  is_customer?: boolean;
  is_supplier?: boolean;
}

/**
 * Kundefelt som nedtrekksliste, som i Go.
 *
 * Klikker man i feltet, kommer kundene alfabetisk; skriver man to tegn, blir
 * lista snevret inn. Velger man en, fyller skjemaet ut resten selv og husker
 * hvem det var — så ordren eller tilbudet kobles til riktig kunde uten å
 * gjette på e-post. Skriver man videre, slippes valget: da er det en ny
 * kunde, eller en som skal stå med andre opplysninger denne gangen.
 *
 * Med onNyKunde får lista «Legg til kunde» nederst, som åpner kontaktkortet.
 */
export function KundeSok({
  value,
  onChange,
  onVelg,
  onNyKunde,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (tekst: string) => void;
  onVelg: (kunde: KundeForslag) => void;
  /** «Legg til kunde» nederst i lista. Får teksten som står i feltet. */
  onNyKunde?: (navn: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [forslag, setForslag] = useState<KundeForslag[]>([]);
  const [lastet, setLastet] = useState(false);
  const [open, setOpen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const sist = useRef("");
  const rot = useRef<HTMLDivElement>(null);
  const felt = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const q = value.trim();
    const t = setTimeout(async () => {
      sist.current = q;
      try {
        const sok = q.length >= 2 ? `q=${encodeURIComponent(q)}` : "liste=1";
        const res = await fetch(`/api/customers?${sok}`);
        if (!res.ok) return;
        const payload = (await res.json()) as { kunder: KundeForslag[] };
        // Et tregt svar på et gammelt søkeord skal ikke skrive over det nye.
        if (sist.current !== q) return;
        setForslag(payload.kunder);
        setLastet(true);
        setAktiv(0);
      } catch {
        // Forslag er en bekvemmelighet; uten dem fungerer skjemaet som før.
      }
    }, q.length >= 2 ? 180 : 0);
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
  }

  function nyKunde() {
    setOpen(false);
    onNyKunde?.(value.trim());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && !open) {
      e.preventDefault();
      setOpen(true);
      return;
    }
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

  const vis = open && lastet && (forslag.length > 0 || Boolean(onNyKunde));

  return (
    <div className="picker kunde-velger" ref={rot}>
      <input
        ref={felt}
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
      <button
        type="button"
        className="kunde-velger-pil"
        tabIndex={-1}
        aria-label="Vis kundene"
        onClick={() => {
          setOpen((o) => !o);
          felt.current?.focus();
        }}
      >
        ▾
      </button>
      {vis && (
        <div className="picker-panel kunde-velger-panel" role="listbox">
          {forslag.length > 0 ? (
            <>
              <div className="kunde-velger-hode" aria-hidden>
                <span>Kundenr.</span>
                <span>Navn ▲</span>
              </div>
              <div className="kunde-velger-rader">
                {forslag.map((k, i) => (
                  <button
                    key={k.id}
                    type="button"
                    role="option"
                    aria-selected={i === aktiv}
                    className={`kunde-velger-rad${i === aktiv ? " active" : ""}`}
                    onMouseEnter={() => setAktiv(i)}
                    onClick={() => velg(k)}
                  >
                    <span className="kunde-velger-kode">{k.customer_no ?? k.kode ?? ""}</span>
                    <span className="kunde-velger-navn">
                      {k.name}
                      <span className="tiny muted">
                        {[k.is_supplier ? (k.is_customer ? "Kunde og leverandør" : "Leverandør") : null, k.email ?? k.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="kunde-velger-tom tiny muted">Ingen kunder passer «{value.trim()}».</div>
          )}
          {onNyKunde && (
            <button type="button" className="kunde-velger-ny" onClick={nyKunde}>
              Legg til kunde
            </button>
          )}
        </div>
      )}
    </div>
  );
}
