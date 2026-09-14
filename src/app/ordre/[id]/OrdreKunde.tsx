"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order } from "@/lib/types";

type Kundefelt = Pick<
  Order,
  "customer_name" | "customer_contact" | "customer_email" | "customer_phone" | "site_address"
>;

const FELT: { navn: keyof Kundefelt; etikett: string; type?: string }[] = [
  { navn: "customer_name", etikett: "Kunde" },
  { navn: "customer_contact", etikett: "Kontaktperson" },
  { navn: "customer_email", etikett: "E-post", type: "email" },
  { navn: "customer_phone", etikett: "Telefon" },
  { navn: "site_address", etikett: "Adresse der jobben gjøres" },
];

/**
 * Kundekortet. Feltene kommer fra tilbudet når ordren ble opprettet derfra,
 * men de er ordrens egne: en ny kontaktperson på jobben skal ikke endre
 * tilbudet, og omvendt.
 */
export function OrdreKunde({ orderId, kunde }: { orderId: string; kunde: Kundefelt }) {
  const router = useRouter();
  const tilStrenger = (k: Kundefelt) =>
    Object.fromEntries(FELT.map((f) => [f.navn, k[f.navn] ?? ""])) as Record<
      keyof Kundefelt,
      string
    >;

  const [verdier, setVerdier] = useState(() => tilStrenger(kunde));
  const [lagret, setLagret] = useState(() => tilStrenger(kunde));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endret = FELT.some((f) => verdier[f.navn].trim() !== lagret[f.navn].trim());

  async function lagre() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verdier),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(verdier);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-pad">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span className="label" style={{ marginBottom: 0 }}>
          Kunde
        </span>
        {endret && (
          <button type="button" className="button" onClick={lagre} disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        )}
      </div>
      {error && <div className="banner error">{error}</div>}
      <div className="grid-2">
        {FELT.map((f) => (
          <label
            key={f.navn}
            className="field"
            style={f.navn === "site_address" ? { gridColumn: "1 / -1", marginBottom: 0 } : undefined}
          >
            <span className="label">{f.etikett}</span>
            <input
              className="input"
              type={f.type ?? "text"}
              value={verdier[f.navn]}
              onChange={(e) => setVerdier((v) => ({ ...v, [f.navn]: e.target.value }))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
