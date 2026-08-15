"use client";

import Link from "next/link";
import { useState } from "react";
import { LeadActions } from "./LeadActions";
import { Modal } from "@/components/Modal";
import { formatDate, type Lead, type LeadStatus } from "@/lib/types";

const STATUS_LABEL: Record<LeadStatus, string> = {
  ny: "Ny",
  utkast_klar: "Utkast klart",
  bekrefta: "Bekreftet",
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
  const [open, setOpen] = useState(false);

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
        </div>
        <span className={`pill ${lead.status}`}>{STATUS_LABEL[lead.status]}</span>
        <span className="lead-time">{formatDate(lead.received_at)}</span>

        {/* Handlingene har sin egen mening — de skal ikke åpne popupen. */}
        <span onClick={(event) => event.stopPropagation()}>
          {lead.status === "ny" ? (
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

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={() => setOpen(false)}>
            Lukk
          </button>
          {lead.status !== "ny" && (
            <Link className="button" href={`/tilbud/leads/${lead.id}`}>
              Åpne utkastet
            </Link>
          )}
        </div>
      </Modal>
    </>
  );
}
