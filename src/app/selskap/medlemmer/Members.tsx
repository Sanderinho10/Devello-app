"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import {
  USER_ROLE_LABELS,
  formatDate,
  type Invitation,
  type Member,
  type UserRole,
} from "@/lib/types";

/**
 * Medlemmer og åpne invitasjoner, i én tabell som i Go.
 *
 * Invitasjonen kobles til selskapet på e-postadressen når den inviterte logger
 * inn første gang — se databasetriggeren i 0010 og 0055. Derfor står raden
 * igjen som «invitert» til det skjer, og ikke bare til e-posten er sendt.
 * Navnet skrives ved invitasjonen og følger med inn på brukeren.
 */
export function Members({
  members,
  invitations,
  isAdmin,
}: {
  members: Member[];
  invitations: Invitation[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fornavn, setFornavn] = useState("");
  const [etternavn, setEtternavn] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Lenken fra siste invitasjon. Vises til den blir kopiert eller siden lastes
  // på nytt — e-posten er ikke til å stole på alene, se kommentaren i
  // /api/invitations.
  const [link, setLink] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  function aapne() {
    setFornavn("");
    setEtternavn("");
    setEmail("");
    setRole("standard");
    setError(null);
    setOpen(true);
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fornavn, etternavn, email, role }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke invitere");

      setOpen(false);
      setLink(payload.link ?? null);
      setKopiert(false);
      if (payload.warning) setWarning(payload.warning);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(invitation: Invitation) {
    if (!window.confirm(`Trekk invitasjonen til ${invitation.email}?`)) return;
    await fetch(`/api/invitations?id=${invitation.id}`, { method: "DELETE" });
    router.refresh();
  }

  const pending = invitations.filter((invitation) => !invitation.accepted_at);
  const kanSende = fornavn.trim() && etternavn.trim() && email.trim();

  return (
    <>
      <div className="verktoylinje">
        {isAdmin && (
          <button type="button" className="button" onClick={aapne}>
            Inviter medlem
          </button>
        )}
        <span className="verktoylinje-hoyre tiny muted">
          {members.length} {members.length === 1 ? "medlem" : "medlemmer"}
          {pending.length > 0 && ` · ${pending.length} invitert`}
        </span>
      </div>

      {warning && <div className="banner warning">{warning}</div>}

      {link && (
        <div className="banner info">
          <div style={{ marginBottom: 8 }}>
            Invitasjonen er sendt på e-post. Kommer den ikke fram — eller virker ikke lenken i den — send denne i
            stedet. Den virker like godt i en melding eller en SMS.
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setKopiert(true);
              }}
            >
              {kopiert ? "Kopiert" : "Kopier"}
            </button>
          </div>
        </div>
      )}

      <div className="card allow-overflow">
        <table className="table tabell-mobil medlem-tabell">
          <thead>
            <tr>
              <th>Navn</th>
              <th>E-post</th>
              <th>Rolle</th>
              <th>Status</th>
              <th aria-label="Handlinger" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td className="hoved">
                  {member.full_name ? <strong>{member.full_name}</strong> : <span className="muted">Navn mangler</span>}
                </td>
                <td className="meta">{member.email}</td>
                <td className="meta">{USER_ROLE_LABELS[member.role]}</td>
                <td className="meta">
                  <span className="pill ferdig">Aktiv</span>
                </td>
                <td className="handling" />
              </tr>
            ))}

            {pending.map((invitation) => {
              const navn = [invitation.fornavn, invitation.etternavn].filter(Boolean).join(" ");
              return (
                <tr key={invitation.id}>
                  <td className="hoved">{navn ? <strong>{navn}</strong> : <span className="muted">—</span>}</td>
                  <td className="meta">{invitation.email}</td>
                  <td className="meta">{USER_ROLE_LABELS[invitation.role]}</td>
                  <td className="meta">
                    <span className="pill utkast_klar" title={`Utløper ${formatDate(invitation.expires_at)}`}>
                      Invitert
                    </span>
                    <span className="tiny muted"> · utløper {kortDato(invitation.expires_at)}</span>
                  </td>
                  <td className="handling">
                    {isAdmin && (
                      <button type="button" className="button ghost" onClick={() => withdraw(invitation)}>
                        Trekk
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="tiny muted" style={{ margin: "10px 2px 0" }}>
        Administratorer styrer selskapet og inviterer. Standard bruker agentene.
      </p>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Inviter medlem">
        <form onSubmit={invite}>
          {error && <div className="banner error">{error}</div>}

          <div className="kontakt-panel ny-post-panel">
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Fornavn</span>
              <input className="input" required autoFocus value={fornavn} onChange={(e) => setFornavn(e.target.value)} />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Etternavn</span>
              <input className="input" required value={etternavn} onChange={(e) => setEtternavn(e.target.value)} />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">E-post</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kollega@firma.no"
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Rolle</span>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                <option value="standard">Standard</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <div className="kontakt-rad">
              <span />
              <span className="hint" style={{ marginTop: -4 }}>
                {role === "admin"
                  ? "Kan endre selskapsinnstillinger og invitere flere."
                  : "Kan bruke agentene, men ikke endre selskapet."}
              </span>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setOpen(false)} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !kanSende}>
              {busy ? "Sender…" : "Send invitasjon"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function kortDato(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(new Date(iso));
}
