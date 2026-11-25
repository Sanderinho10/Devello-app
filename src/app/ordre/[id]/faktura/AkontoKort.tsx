"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { INVOICE_DRAFT_STATUS_LABELS, formatDate, formatNok, type InvoiceDraftStatus, type OrderStatus } from "@/lib/types";

/**
 * A konto på ordren (0071): det som er fakturert underveis, og knappen for
 * en ny akontofaktura.
 *
 * En akontofaktura er et beløp eller en prosent av avtalt pris. Den lages
 * her, og redigeres, godkjennes og overføres på sin egen side
 * (/fakturaer/[id]) som enhver annen faktura. Ordren står åpen etterpå, og
 * sluttfakturaen under trekker fra det som er overført.
 */

export interface AkontoRad {
  id: string;
  nr: number;
  status: InvoiceDraftStatus;
  /** Beløpet a konto, eks. mva. */
  belop: number;
  transferred_at: string | null;
  transfer_order_no: string | null;
}

export function AkontoKort({
  orderId,
  orderStatus,
  planlagt,
  akontoar,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  /** Avtalt pris eks. mva. null: ordren har ingen, og prosent kan ikke brukes. */
  planlagt: number | null;
  akontoar: AkontoRad[];
}) {
  const router = useRouter();
  const harGrunnlag = planlagt !== null && planlagt > 0;
  const [open, setOpen] = useState(false);
  const [modus, setModus] = useState<"prosent" | "belop">(harGrunnlag ? "prosent" : "belop");
  const [verdi, setVerdi] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kanLage = orderStatus === "opna" || orderStatus === "paagaar" || orderStatus === "ferdig";
  const aapen = akontoar.find((a) => a.status !== "overfort");
  const fakturert = akontoar.filter((a) => a.status === "overfort").reduce((acc, a) => acc + a.belop, 0);

  // Ingenting å vise på en ordre som er ferdig fakturert uten a konto.
  if (!kanLage && akontoar.length === 0) return null;

  const tall = Number(verdi.replace(/\s/g, "").replace(",", "."));
  const gyldig = verdi.trim() !== "" && Number.isFinite(tall) && tall > 0 && (modus === "belop" || tall <= 100);
  const belop = !gyldig ? null : modus === "prosent" ? Math.round(((planlagt ?? 0) * tall) / 100 * 100) / 100 : tall;

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!gyldig) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/faktura/akonto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modus === "prosent" ? { percent: tall } : { amount: tall }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lage akontofakturaen");
      router.push(`/fakturaer/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="label" style={{ marginBottom: 0 }}>
          A konto
        </span>
        {kanLage &&
          (aapen ? (
            <Link className="linkish" href={`/fakturaer/${aapen.id}`}>
              Åpne a konto nr. {aapen.nr}
            </Link>
          ) : (
            <button type="button" className="linkish" onClick={() => setOpen(true)}>
              + Ny akontofaktura
            </button>
          ))}
      </div>

      {akontoar.length === 0 ? (
        <p className="muted tiny" style={{ padding: "12px 18px" }}>
          Fakturer et beløp eller en prosent av avtalt pris underveis. Ordren står åpen, og sluttfakturaen trekker
          fra det som er fakturert a konto.
        </p>
      ) : (
        <>
          <div className="lead-list">
            {akontoar.map((a) => (
              <Link key={a.id} className="ordre-velger-rad" href={`/fakturaer/${a.id}`}>
                <span className="lead-main">
                  <span style={{ display: "block", fontWeight: 550 }}>A konto nr. {a.nr}</span>
                  <span className="tiny muted">
                    {a.status === "overfort"
                      ? `Overført ${formatDate(a.transferred_at)}${a.transfer_order_no ? ` · ordre ${a.transfer_order_no} i regnskapssystemet` : ""}`
                      : "Ikke overført ennå — trekkes ikke fra før den er det"}
                  </span>
                </span>
                <span className="nowrap">{formatNok(a.belop)}</span>
                <span className={`pill ${a.status === "godkjent" || a.status === "overfort" ? "ferdig" : a.status === "feil" ? "avbrutt" : "opna"}`}>
                  {INVOICE_DRAFT_STATUS_LABELS[a.status]}
                </span>
              </Link>
            ))}
          </div>
          <p className="muted tiny" style={{ padding: "10px 18px" }}>
            Fakturert a konto: <strong>{formatNok(fakturert)}</strong> eks. mva
            {harGrunnlag && ` av avtalt ${formatNok(planlagt)} (${Math.round((fakturert / planlagt) * 100)} %)`}. Trekkes fra på
            sluttfakturaen.
          </p>
        </>
      )}

      <Modal open={open} onClose={close} title="Ny akontofaktura">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}
          <div className="type-switch liten" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`type-option${modus === "prosent" ? " active" : ""}`}
              disabled={!harGrunnlag}
              title={harGrunnlag ? undefined : "Ordren har ingen avtalt pris å regne prosent av"}
              onClick={() => {
                setModus("prosent");
                setVerdi("");
              }}
            >
              Prosent av avtalt pris
            </button>
            <button
              type="button"
              className={`type-option${modus === "belop" ? " active" : ""}`}
              onClick={() => {
                setModus("belop");
                setVerdi("");
              }}
            >
              Beløp
            </button>
          </div>
          <div className="field">
            <label htmlFor="akonto-verdi">{modus === "prosent" ? "Prosent" : "Beløp eks. mva"}</label>
            <input
              id="akonto-verdi"
              className="input"
              inputMode="decimal"
              autoFocus
              value={verdi}
              onChange={(e) => setVerdi(e.target.value)}
              placeholder={modus === "prosent" ? "30" : "25 000"}
              style={{ maxWidth: 180 }}
            />
            <span className="hint">
              {modus === "prosent" && harGrunnlag
                ? belop !== null
                  ? `${formatNok(belop)} eks. mva av avtalt ${formatNok(planlagt)}.`
                  : `Avtalt pris er ${formatNok(planlagt)} eks. mva.`
                : "Mva kommer i tillegg."}
              {fakturert > 0 && ` Fakturert a konto fra før: ${formatNok(fakturert)}.`}
            </span>
          </div>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !gyldig}>
              {busy ? "Lager…" : "Lag akontofaktura"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
