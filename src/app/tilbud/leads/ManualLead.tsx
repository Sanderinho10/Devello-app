"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

/**
 * Manuell henvendelse — for jobber som kom på telefon.
 *
 * Saksbehandleren skriver hva kunden spurte om, med sine egne ord, og agenten
 * behandler det som en hvilken som helst forespørsel. Ingen skjemafelt for
 * antall og poster: å plukke ut hva jobben består av er nettopp det agenten
 * skal gjøre.
 */
export function ManualLead() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  // Popupen lukkes så snart henvendelsen er lagret — ikke når utkastet er
  // ferdig. Agenten bruker et minutt, og den tiden skal brukeren kunne bruke
  // på noe annet. Linjen dukker opp i listen med status «genererer», og
  // oppdaterer seg selv når utkastet er klart.

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!description.trim()) return;

    setError(null);
    try {
      setBusy(true);
      const created = await fetch("/api/leads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          customer_name: name,
          customer_email: email,
        }),
      });
      const lead = await created.json();
      if (!created.ok) throw new Error(lead.error ?? "Kunne ikke lagre henvendelsen");

      setOpen(false);
      setDescription("");
      setName("");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        Manuell henvendelse
      </button>

      <Modal open={open} onClose={close} size="wide" title="Manuell henvendelse">
        <form onSubmit={submit}>
          {error && <div className="banner error">{error}</div>}

          <label className="field">
            <span className="label">Hva spurte kunden om?</span>
            <textarea
              className="textarea tall"
              autoFocus
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                "Skriv med egne ord, slik du ville forklart det til en kollega.\n\n" +
                "«Marit ringte. Skal pusse opp kjellerstua, ca. 24 m². Trenger 8 doble " +
                "stikkontakter, 4 takpunkt med bryter og en ny kurs fra sikringsskapet. " +
                "Veggene er åpne. Vil ha det gjort i september.»"
              }
            />
            <span className="hint">
              Agenten leser dette som en vanlig forespørsel og finner selv ut
              hvilke poster jobben består av.
            </span>
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Kunde (valgfritt)</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marit Aasen"
              />
            </label>
            <label className="field">
              <span className="label">E-post (valgfritt)</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marit@example.no"
              />
            </label>
          </div>
          <span className="hint">
            E-posten blir mottaker på Outlook-kladden. Lar du den stå tom, fyller
            du den inn i Outlook før du sender.
          </span>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={busy}
            >
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Lagrer…" : "Lag utkast"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
