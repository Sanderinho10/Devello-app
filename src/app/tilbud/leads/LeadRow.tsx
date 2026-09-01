"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeadActions } from "./LeadActions";
import { Modal } from "@/components/Modal";
import { formatDate, type Lead, type LeadStatus } from "@/lib/types";

const STATUS_LABEL: Record<LeadStatus, string> = {
  ny: "Ny",
  genererer: "Genererer…",
  utkast_klar: "Utkast klart",
  bekrefta: "Bekreftet",
  sendt: "Sendt",
};

/**
 * En rad i leads-listen, med hele henvendelsen bak et klikk.
 *
 * Listen viser bare emne og avsender, og det er sjelden nok til å vurdere om
 * agenten har lest jobben riktig. Popupen er stedet man leser e-posten som den
 * faktisk kom inn.
 *
 * Raden er klikkbar for mus, men det er emnet som er den fokuserbare knappen.
 * En hel rad med role="button" ville pakket «Åpne»-knappen inn i en annen
 * knapp — her er det ett kontrollelement, og raden er bare et større treffområde.
 */
export function LeadRow({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sletter, setSletter] = useState(false);
  const [sletteFeil, setSletteFeil] = useState<string | null>(null);

  /**
   * Sletting bor i popupen, ikke på raden.
   *
   * Der har man nettopp lest henvendelsen og vet hva man kaster — og en
   * slettknapp på hver rad i en liste er en ulykke som venter på et
   * feilklikk. Bekreftelsesdialogen er siste skanse, ikke første.
   */
  async function slett() {
    if (
      !window.confirm(
        `Slette «${lead.subject || "(uten emne)"}»? Utkastet og historikken forsvinner — dette kan ikke angres.`,
      )
    ) {
      return;
    }
    setSletter(true);
    setSletteFeil(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setSletteFeil(err instanceof Error ? err.message : String(err));
      setSletter(false);
    }
  }

  const body = lead.body_text || lead.body_preview;

  // Et manuelt lead har ofte verken navn eller e-post. Da ville avsenderlinjen
  // stått tom og sett ut som en e-post vi ikke klarte å lese.
  const parts = [lead.from_name, lead.from_email].filter(Boolean);
  if (lead.source === "manuell") parts.push("manuell henvendelse");
  const sender = parts.join(" · ") || "(ukjent avsender)";

  return (
    <>
      <div className="lead-row clickable" onClick={() => setOpen(true)}>
        <div className="lead-main">
          <button
            type="button"
            className="lead-subject"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
          >
            {lead.subject || "(uten emne)"}
          </button>
          <div className="lead-meta">{sender}</div>
          {lead.generation_error && (
            <div className="lead-meta" style={{ color: "#c0392b" }}>
              Genereringen stoppet: {lead.generation_error}
            </div>
          )}
        </div>
        <span className={`pill ${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
        <span className="lead-time">{formatDate(lead.received_at)}</span>

        {/* Handlingene har sin egen mening — de skal ikke åpne popupen. */}
        <span onClick={(event) => event.stopPropagation()}>
          {lead.status === "genererer" ? (
            // Ingen knapp mens agenten holder på: to samtidige genereringer på
            // samme lead ville bare overskrevet hverandre.
            <span className="tiny muted">Agenten jobber…</span>
          ) : lead.status === "ny" ? (
            <LeadActions kind="generer" leadId={lead.id} />
          ) : (
            <Link className="button secondary" href={`/tilbud/leads/${lead.id}`}>
              Åpne
            </Link>
          )}
        </span>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="wide"
        title={lead.subject || "(uten emne)"}
      >
        <div className="lead-detail-meta">
          <div>{sender}</div>
          <div>{formatDate(lead.received_at)}</div>
        </div>

        {body ? (
          <div className="lead-body">{body}</div>
        ) : (
          <p className="muted">Denne e-posten har ingen tekst.</p>
        )}

        {sletteFeil && <div className="banner error">{sletteFeil}</div>}

        <div className="modal-actions">
          {lead.status !== "genererer" && lead.status !== "sendt" && (
            <button
              type="button"
              className="button danger"
              onClick={slett}
              disabled={sletter}
              style={{ marginRight: "auto" }}
            >
              {sletter ? "Sletter…" : "Slett"}
            </button>
          )}
          <button type="button" className="button secondary" onClick={() => setOpen(false)}>
            Lukk
          </button>
          {lead.status !== "ny" && lead.status !== "genererer" && (
            <Link className="button" href={`/tilbud/leads/${lead.id}`}>
              Åpne utkastet
            </Link>
          )}
        </div>
      </Modal>
    </>
  );
}
