"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { KundeForslag } from "@/components/KundeSok";
import { adresseTekst } from "@/lib/kunder/adresse";
import { KontaktFelt, harType, manglar, tomKontakt, type KontaktVerdier } from "./KontaktFelt";

/** Ny kontakt for hånd. Navnet er påkrevd, og den må være kunde, leverandør eller begge. */
export function NyKontakt() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>
        Ny kontakt
      </button>
      <NyKontaktDialog
        open={open}
        onClose={() => setOpen(false)}
        onOpprettet={(k) => router.push(`/register/kontakter/${k.id}`)}
      />
    </>
  );
}

/**
 * Kontaktkortet som popup — fra Kontakter, og fra kundefeltet i andre skjemaer
 * («Legg til kunde» i «Ny ordre», som i Go). onOpprettet får kunden tilbake i
 * samme form som kundesøket, så skjemaet kan velge den med en gang.
 */
export function NyKontaktDialog({
  open,
  onClose,
  onOpprettet,
  startNavn = "",
  tittel = "Ny kontakt",
  knapp = "Opprett kontakt",
}: {
  open: boolean;
  onClose: () => void;
  onOpprettet: (kunde: KundeForslag) => void;
  /** Navnet man alt har skrevet i kundefeltet. */
  startNavn?: string;
  tittel?: string;
  knapp?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [felt, setFelt] = useState<KontaktVerdier>(tomKontakt);
  const [fane, setFane] = useState<"kontakt" | "adresser" | "notater">("kontakt");

  // Nytt kort hver gang popupen åpnes, med navnet som alt er skrevet.
  useEffect(() => {
    if (open) {
      setFelt({ ...tomKontakt, name: startNavn });
      setFane("kontakt");
      setError(null);
    }
  }, [open, startNavn]);

  function close() {
    if (busy) return;
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Popupen kan ligge inni et annet skjema; innsendingen er bare denne.
    event.stopPropagation();
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
      const adresse = { linje1: felt.address, linje2: felt.address2, postnr: felt.postal_code, sted: felt.city };
      onOpprettet({
        id: payload.id,
        name: felt.name,
        contact: felt.contact || null,
        email: felt.email || null,
        phone: felt.phone || null,
        address: adresseTekst({ ...adresse, land: felt.country || "Norge" }) || null,
        adresse,
        kode: null,
      });
      setBusy(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title={tittel} size="wide">
      <form onSubmit={submit}>
        {error && <div className="banner error">{error}</div>}
        <KontaktFelt verdier={felt} onChange={setFelt} autoFocus fane={fane} onFane={setFane} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={close} disabled={busy}>
            Avbryt
          </button>
          <button className="button" type="submit" disabled={busy || !harType(felt)}>
            {busy ? "Oppretter…" : knapp}
          </button>
        </div>
      </form>
    </Modal>
  );
}
