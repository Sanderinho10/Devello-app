"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { Customer } from "@/lib/types";
import { KontaktFelt, erEndret, harType, manglar, tilVerdier } from "../KontaktFelt";

/**
 * «Rediger kontakt»: kontaktkortet som popup, som i Go. Kontaktsiden selv er
 * oversikten over tilbud, ordrer og fakturaer; her endres navn, adresser og
 * notater. Endringer rører ikke tilbud eller ordrer som alt finnes.
 *
 * Kundenummeret i Go vises over fanene. Det settes bare av overføringen;
 * herfra kan det bare fjernes, for når kunden i Go er feil.
 */
export function KontaktKort({
  kontakt,
  goNummerGjeld,
}: {
  kontakt: Customer;
  /** Hører kundenummeret i Go til koblingen selskapet har nå? null: ukjent. */
  goNummerGjeld?: boolean | null;
}) {
  const router = useRouter();
  const [verdier, setVerdier] = useState(() => tilVerdier(kontakt));
  const [lagret, setLagret] = useState(() => tilVerdier(kontakt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fane, setFane] = useState<"kontakt" | "adresser" | "notater">("kontakt");
  const [open, setOpen] = useState(false);

  const endret = erEndret(verdier, lagret);

  async function fjernGoNummer() {
    if (!confirm("Fjerne kundenummeret? Neste overføring leter opp kunden i PowerOffice Go på nytt.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${kontakt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounting_customer_no: null }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke fjerne kundenummeret");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function lagre() {
    const feil = manglar(verdier);
    if (feil) {
      setError(feil);
      setFane("kontakt");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${kontakt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(verdier),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(verdier);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function lukk() {
    if (busy) return;
    // Avbryt: det som ikke er lagret, kastes.
    setVerdier(lagret);
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => {
          setFane("kontakt");
          setOpen(true);
        }}
      >
        Rediger kontakt
      </button>

      <Modal open={open} onClose={lukk} title={`Rediger ${lagret.name || "kontakt"}`} size="wide">
        {error && <div className="banner error">{error}</div>}
        {kontakt.accounting_customer_no && (
          <div className="kontakt-go">
            <span>
              Kundenr. i PowerOffice Go: <strong>{kontakt.accounting_customer_no}</strong>
              {goNummerGjeld === false && (
                <span className="muted"> — fra en tidligere kobling, brukes ikke</span>
              )}
            </span>
            <button type="button" className="button ghost" onClick={fjernGoNummer} disabled={busy}>
              Fjern
            </button>
          </div>
        )}
        <KontaktFelt verdier={verdier} onChange={setVerdier} fane={fane} onFane={setFane} autoFocus />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={lukk} disabled={busy}>
            Avbryt
          </button>
          <button type="button" className="button" onClick={lagre} disabled={busy || !endret || !harType(verdier)}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      </Modal>
    </>
  );
}
