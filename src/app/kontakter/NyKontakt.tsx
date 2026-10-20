"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { KontaktFelt, harType, manglar, tomKontakt } from "./KontaktFelt";

/** Ny kontakt for hånd. Navnet er påkrevd, og den må være kunde, leverandør eller begge. */
export function NyKontakt() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState(tomKontakt);
  const [fane, setFane] = useState<"kontakt" | "adresser" | "notater">("kontakt");

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const feil = manglar(felt);
    if (feil) {
      // Navn og kunde/leverandør står på Kontakt-fanen.
      setError(feil);
      setFane("kontakt");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(felt),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette kontakten");
      router.push(`/kontakter/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny kontakt
      </button>

      <Modal open={open} onClose={close} title="Ny kontakt" size="wide">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}
          <KontaktFelt verdier={felt} onChange={setFelt} autoFocus fane={fane} onFane={setFane} />
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !harType(felt)}>
              {busy ? "Oppretter…" : "Opprett kontakt"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
