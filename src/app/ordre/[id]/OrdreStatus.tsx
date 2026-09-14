"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { lovligeOverganger, OVERGANG_TEKST } from "@/lib/ordre/status";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";

/**
 * Statusmerket med knappene for det som er lov herfra.
 *
 * Knappene sier hva som skjer med jobben — «Start jobben», «Merk som
 * ferdig» — ikke hvilken verdi en kolonne får. Avbryt står for seg selv
 * og spør først; det er den eneste overgangen som ikke er et vanlig neste
 * steg.
 */
export function OrdreStatus({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function bytt(til: OrderStatus) {
    if (til === "avbrutt" && !window.confirm("Avbryte ordren? Den kan åpnes igjen etterpå.")) {
      return;
    }
    setBusy(til);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: til }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke endre status");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const overganger = lovligeOverganger(status);
  const vanlige = overganger.filter((s) => s !== "avbrutt");
  const kanAvbryte = overganger.includes("avbrutt");

  // Neste steg framover er hovedknappen; et steg tilbake er sekundært.
  const REKKEFOLGE: OrderStatus[] = ["opna", "paagaar", "ferdig", "fakturert"];
  const erTilbake = (til: OrderStatus) =>
    REKKEFOLGE.indexOf(til) < REKKEFOLGE.indexOf(status);

  return (
    <div className="ordre-status">
      <span className={`pill ${status}`}>{ORDER_STATUS_LABELS[status]}</span>
      {vanlige.map((til) => (
        <button
          key={til}
          type="button"
          className={`button${erTilbake(til) ? " secondary" : ""}`}
          onClick={() => bytt(til)}
          disabled={busy !== null}
        >
          {busy === til ? "Lagrer…" : OVERGANG_TEKST[til]}
        </button>
      ))}
      {kanAvbryte && (
        <button
          type="button"
          className="button ghost"
          onClick={() => bytt("avbrutt")}
          disabled={busy !== null}
        >
          {busy === "avbrutt" ? "Lagrer…" : OVERGANG_TEKST.avbrutt}
        </button>
      )}
      {error && <span className="tiny" style={{ color: "#a4271b" }}>{error}</span>}
    </div>
  );
}
