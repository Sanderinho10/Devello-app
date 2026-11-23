"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_TYPE_LABELS, type OrderType } from "@/lib/types";

/**
 * Ordretypen: fastpris, eller timer og materiell.
 *
 * Kontoret må vite det når jobben skal faktureres. En ordre fra et tilbud
 * arver tilbudstypen; en ordre uten tilbud får den valgt da den ble laget —
 * og den kan rettes her. Fastpris uten tilbud kan ha en avtalt sum, som da
 * står som planlagt sum på ordren. Lagres med én gang.
 */
export function OrdreType({
  orderId,
  ordretype,
  avtaltPris,
  harTilbud,
  laast,
}: {
  orderId: string;
  ordretype: OrderType | null;
  /** Planlagt sum. Kan bare rettes her når ordren ikke har et tilbud. */
  avtaltPris: number | null;
  harTilbud: boolean;
  laast: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<OrderType | "">(ordretype ?? "");
  const [pris, setPris] = useState(avtaltPris === null ? "" : String(avtaltPris).replace(".", ","));
  const [lagretPris, setLagretPris] = useState(pris);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lagre(body: Record<string, unknown>, angre: () => void) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      router.refresh();
    } catch (err) {
      angre();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function byttType(ny: OrderType | "") {
    const forrige = type;
    setType(ny);
    void lagre({ order_type: ny || null }, () => setType(forrige));
  }

  function lagrePris() {
    if (pris.trim() === lagretPris.trim()) return;
    const forrige = lagretPris;
    setLagretPris(pris);
    void lagre({ planned_total: pris.trim() }, () => {
      setLagretPris(forrige);
      setPris(forrige);
    });
  }

  return (
    <div className="card card-pad ordre-ansvar">
      <span className="label">Ordretype</span>
      {error && <div className="banner error">{error}</div>}
      <label className="kontakt-rad">
        <span className="kontakt-rad-etikett">Type</span>
        <select
          className={`input${type ? "" : " forslag-valg"}`}
          value={type}
          disabled={busy || laast}
          onChange={(e) => byttType(e.target.value as OrderType | "")}
        >
          <option value="">Ikke valgt</option>
          <option value="fastpris">{ORDER_TYPE_LABELS.fastpris}</option>
          <option value="tid_og_materiell">{ORDER_TYPE_LABELS.tid_og_materiell}</option>
        </select>
      </label>
      {type === "fastpris" && !harTilbud && (
        <label className="kontakt-rad">
          <span className="kontakt-rad-etikett">Avtalt pris</span>
          <input
            className="input"
            inputMode="decimal"
            value={pris}
            disabled={busy || laast}
            placeholder="eks. mva"
            onChange={(e) => setPris(e.target.value)}
            onBlur={lagrePris}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
      )}
      {harTilbud && <span className="hint">Følger tilbudet. Rett den hvis avtalen ble en annen.</span>}
    </div>
  );
}
