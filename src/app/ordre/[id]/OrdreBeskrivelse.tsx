"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Arbeidsbeskrivelsen — det montøren leser først.
 *
 * Agenten skriver et første utkast når ordren kommer fra et tilbud. Det er
 * et utkast: hintet under sier hvem som skrev det, og forsvinner så snart
 * et menneske har lagret sin egen versjon.
 *
 * Teksten lagres av seg selv: et sekund etter siste tastetrykk, når feltet
 * mister fokus, og når brukeren går til en annen fane eller lukker siden.
 * Den siste lagringen går med keepalive, så den fullføres selv om siden
 * er på vei bort.
 */
export function OrdreBeskrivelse({
  orderId,
  description,
  source,
}: {
  orderId: string;
  description: string | null;
  source: "ai" | "manuell" | null;
}) {
  const router = useRouter();
  const [tekst, setTekst] = useState(description ?? "");
  const [lagret, setLagret] = useState(description ?? "");
  const [busy, setBusy] = useState(false);
  const [harLagret, setHarLagret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs: lagringen ved avmontering må se siste tekst, ikke den fra første tegning.
  const tekstRef = useRef(tekst);
  const lagretRef = useRef(lagret);
  const montert = useRef(true);
  // Én lagring om gangen, i rekkefølge — ellers kan en eldre tekst lande sist.
  const koe = useRef<Promise<void>>(Promise.resolve());

  const lagre = useCallback(
    (paaVeiBort = false) => {
      const ny = tekstRef.current;
      if (ny.trim() === lagretRef.current.trim()) return;
      // Settes med en gang, så blur + avmontering ikke sender samme tekst to ganger.
      const forrige = lagretRef.current;
      lagretRef.current = ny;
      if (!paaVeiBort) {
        setBusy(true);
        setError(null);
      }
      const send = async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: ny }),
            keepalive: true,
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
          if (montert.current) {
            setLagret(ny);
            setHarLagret(true);
            router.refresh();
          }
        } catch (err) {
          if (lagretRef.current === ny) lagretRef.current = forrige;
          if (montert.current) setError(err instanceof Error ? err.message : String(err));
        } finally {
          if (montert.current) setBusy(false);
        }
      };
      koe.current = paaVeiBort ? send() : koe.current.then(send);
    },
    [orderId, router],
  );

  // Et sekund etter siste tastetrykk.
  useEffect(() => {
    tekstRef.current = tekst;
    if (tekst.trim() === lagretRef.current.trim()) return;
    const timer = window.setTimeout(() => lagre(), 1000);
    return () => window.clearTimeout(timer);
  }, [tekst, lagre]);

  // Ny fane i ordren (avmontering), ny fane i nettleseren eller lukket side.
  useEffect(() => {
    montert.current = true;
    const bort = () => lagre(true);
    const skjult = () => {
      if (document.visibilityState === "hidden") lagre(true);
    };
    window.addEventListener("pagehide", bort);
    document.addEventListener("visibilitychange", skjult);
    return () => {
      window.removeEventListener("pagehide", bort);
      document.removeEventListener("visibilitychange", skjult);
      montert.current = false;
      lagre(true);
    };
  }, [lagre]);

  const endret = tekst.trim() !== lagret.trim();

  return (
    <div className="card card-pad">
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Beskrivelse
        </span>
        <span className="tiny muted" aria-live="polite">
          {busy || endret ? "Lagrer…" : harLagret && !error ? "Lagret" : ""}
        </span>
      </div>
      {error && (
        <div className="banner error">
          {error}{" "}
          <button type="button" className="linkish" onClick={() => lagre()}>
            Prøv igjen
          </button>
        </div>
      )}
      <textarea
        className="textarea"
        value={tekst}
        onChange={(e) => {
          tekstRef.current = e.target.value;
          setTekst(e.target.value);
        }}
        onBlur={() => lagre()}
        placeholder="Skriv kort hva jobben går ut på."
        style={{ minHeight: 110 }}
      />
      {source === "ai" && !endret && (
        <span className="hint">
          Skrevet av agenten ut fra henvendelsen og tilbudet — rediger fritt.
        </span>
      )}
    </div>
  );
}
