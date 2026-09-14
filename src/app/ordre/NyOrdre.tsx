"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

/**
 * Ny ordre uten tilbud — en servicejobb som kom på telefon.
 *
 * Bare tittelen er påkrevd. Kundefeltene kan fylles inn nå eller på ordren
 * etterpå; det viktigste er at jobben får et nummer med en gang, så
 * montøren har noe å skrive på bestillingen.
 */
export function NyOrdre() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState({
    title: "",
    customer_name: "",
    customer_contact: "",
    customer_email: "",
    customer_phone: "",
    site_address: "",
  });

  function sett(navn: keyof typeof felt, verdi: string) {
    setFelt((f) => ({ ...f, [navn]: verdi }));
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!felt.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(felt),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette ordren");
      router.push(`/ordre/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny ordre
      </button>

      <Modal open={open} onClose={close} title="Ny ordre">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <label className="field">
            <span className="label">Hva er jobben?</span>
            <input
              className="input"
              autoFocus
              required
              value={felt.title}
              onChange={(e) => sett("title", e.target.value)}
              placeholder="Bytte sikringsskap — Storgata 12"
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Kunde</span>
              <input
                className="input"
                value={felt.customer_name}
                onChange={(e) => sett("customer_name", e.target.value)}
                placeholder="Marit Aasen"
              />
            </label>
            <label className="field">
              <span className="label">Kontaktperson</span>
              <input
                className="input"
                value={felt.customer_contact}
                onChange={(e) => sett("customer_contact", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">E-post</span>
              <input
                className="input"
                type="email"
                value={felt.customer_email}
                onChange={(e) => sett("customer_email", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Telefon</span>
              <input
                className="input"
                value={felt.customer_phone}
                onChange={(e) => sett("customer_phone", e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="label">Adresse der jobben gjøres</span>
            <input
              className="input"
              value={felt.site_address}
              onChange={(e) => sett("site_address", e.target.value)}
              placeholder="Storgata 12, 0155 Oslo"
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={close} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Oppretter…" : "Opprett ordre"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
