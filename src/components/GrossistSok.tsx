"use client";

import { useEffect, useRef, useState } from "react";
import { formatNok } from "@/lib/types";

export interface GrossistTreff {
  id: string;
  supplier_name: string;
  item_no: string;
  name: string;
  unit: string;
  list_price_per_unit: number;
  net_price_per_unit: number | null;
}

/**
 * Søkefelt mot grossistkatalogen.
 *
 * Brukt to steder: på Grossister-fanen for å kontrollere at katalogen er
 * riktig, og på Materiell-fanen for å plukke en vare til ordren. Med
 * `onVelg` blir treffene trykkbare; uten er det bare en liste.
 *
 * 250 ms debounce: montøren skriver «stikk» som fem tastetrykk, og det er
 * det siste vi vil svare på. Svar som kommer i feil rekkefølge kastes.
 */
export function GrossistSok({
  onVelg,
  placeholder = "Søk på navn eller elnummer",
  autoFocus = false,
}: {
  onVelg?: (treff: GrossistTreff) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [treff, setTreff] = useState<GrossistTreff[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sistSpurt = useRef(0);

  useEffect(() => {
    const spoersmaal = q.trim();
    if (!spoersmaal) {
      setTreff([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const nr = ++sistSpurt.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/grossist/sok?q=${encodeURIComponent(spoersmaal)}&limit=20`);
        const payload = await res.json();
        if (nr !== sistSpurt.current) return;
        if (!res.ok) throw new Error(payload.error ?? "Søket feilet");
        setTreff(payload.items ?? []);
        setError(null);
      } catch (err) {
        if (nr !== sistSpurt.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (nr === sistSpurt.current) setBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  return (
    <div className="grossist-sok">
      <input
        className="input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      {error && <div className="banner error" style={{ marginTop: 10 }}>{error}</div>}
      {q.trim() && !busy && !error && treff.length === 0 && (
        <p className="muted tiny" style={{ marginTop: 10 }}>
          Ingen treff på «{q.trim()}».
        </p>
      )}
      {treff.length > 0 && (
        <div className="lead-list grossist-treff" style={{ marginTop: 10 }}>
          {treff.map((t) =>
            onVelg ? (
              <button
                key={t.id}
                type="button"
                className="lead-row clickable grossist-rad"
                onClick={() => onVelg(t)}
              >
                <TreffInnhold treff={t} />
              </button>
            ) : (
              <div key={t.id} className="lead-row grossist-rad">
                <TreffInnhold treff={t} />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TreffInnhold({ treff }: { treff: GrossistTreff }) {
  return (
    <>
      <span className="ordre-nr">{treff.item_no}</span>
      <div className="lead-main">
        <div className="lead-subject" style={{ cursor: "inherit" }}>
          {treff.name}
        </div>
        <div className="lead-meta">
          {treff.supplier_name} · per {treff.unit}
        </div>
      </div>
      <span className="ordre-sum">
        {treff.net_price_per_unit !== null ? (
          <>
            <strong>{formatPris(treff.net_price_per_unit)}</strong>
            <span className="tiny muted"> netto · liste {formatPris(treff.list_price_per_unit)}</span>
          </>
        ) : (
          <>
            <strong>{formatPris(treff.list_price_per_unit)}</strong>
            <span className="tiny muted"> liste</span>
          </>
        )}
      </span>
    </>
  );
}

/** Enhetspriser med øre: en kabel til 38,50 per meter skal ikke bli «39 kr». */
export function formatPris(n: number): string {
  if (Number.isInteger(n) && n >= 100) return formatNok(n);
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
