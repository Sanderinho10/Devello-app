"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { KundeFelt, tomKunde } from "./KundeFelt";

/** Ny kunde for hånd. Bare navnet er påkrevd. */
export function NyKunde() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState(tomKunde);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!felt.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(felt),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette kunden");
      router.push(`/kunder/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny kunde
      </button>

      <Modal open={open} onClose={close} title="Ny kunde">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}
          <KundeFelt verdier={felt} onChange={setFelt} autoFocus />
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Oppretter…" : "Opprett kunde"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
