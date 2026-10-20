"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LeadActions } from "./LeadActions";
import { Modal } from "@/components/Modal";
import { LEAD_STATUS_LABELS, formatDate, type Lead } from "@/lib/types";

/**
 * En rad i leads-listen, med hele henvendelsen bak et klikk.
 *
 * Listen viser bare emne og avsender, og det er sjelden nok til å vurdere om
 * agenten har lest jobben riktig. Popupen er stedet man leser e-posten som den
 * faktisk kom inn.
 *
 * Emnet går til utkastet, som «Åpne». Klikk ellers på raden viser e-posten i
 * popupen; for tastaturet er det avsenderen som er knappen for popupen. En hel
 * rad med role="button" ville pakket lenken og «Åpne» inn i en annen knapp.
 */
export function LeadRow({
  lead,
  revisjon = 1,
  tilbudsnr = null,
}: {
  lead: Lead;
  /** Tilbudsversjonen. Over 1 når et sendt tilbud er åpnet igjen. */
  revisjon?: number;
  /** Løpenummeret, når agenten har laget et utkast. */
  tilbudsnr?: number | null;
}) {
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
  const harUtkast = lead.status !== "ny" && lead.status !== "genererer";

  return (
      <tr onClick={() => setOpen(true)}>
        <td className="ordre-nr">{tilbudsnr ?? ""}</td>
        <td>
          {/* Emnet går rett til utkastet, som «Åpne». Resten av raden viser
              e-posten i popupen. Uten utkast finnes det ingen side å gå til,
              så da åpner emnet popupen. */}
          {harUtkast ? (
            <Link
              className="lenke"
              href={`/tilbud/leads/${lead.id}`}
              onClick={(event) => event.stopPropagation()}
            >
              {lead.subject || "(uten emne)"}
            </Link>
          ) : (
            <button
              type="button"
              className="lenke knapp"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(true);
              }}
            >
              {lead.subject || "(uten emne)"}
            </button>
          )}
          {lead.generation_error && (
            <div className="tiny" style={{ color: "var(--negative)" }}>
              Genereringen stoppet: {lead.generation_error}
            </div>
          )}
        </td>
        <td>
          <button
            type="button"
            className="celle-knapp"
            title="Vis e-posten"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(true);
            }}
          >
            {sender}
          </button>
        </td>
        <td className="nowrap">
          <span className={`pill ${lead.status}`}>{LEAD_STATUS_LABELS[lead.status]}</span>
          {revisjon > 1 && (
            <span
              className="pill versjon"
              style={{ marginLeft: 6 }}
              title={`Versjon ${revisjon} — tilbudet er åpnet igjen etter at det ble sendt`}
            >
              v{revisjon}
            </span>
          )}
        </td>
        <td className="num muted nowrap">{formatDate(lead.received_at)}</td>

        {/* Handlingene har sin egen mening — de skal ikke åpne popupen. Popupen
            bor også her, så klikk inni den ikke bobler opp til raden og åpner
            den igjen idet den lukkes. */}
        <td className="handling" onClick={(event) => event.stopPropagation()}>
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
          {lead.status !== "genererer" && lead.status !== "sendt" && revisjon === 1 && (
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
        </td>
      </tr>
  );
}
