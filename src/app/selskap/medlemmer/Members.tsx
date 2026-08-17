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
 * Medlemmer og åpne invitasjoner.
 *
 * Invitasjonen kobles til selskapet på e-postadressen når den inviterte logger
 * inn første gang — se databasetriggeren i 0010. Derfor står raden igjen som
 * «venter» til det skjer, og ikke bare til e-posten er sendt.
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

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke invitere");

      setEmail("");
      setRole("standard");
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

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div>
            <strong>Medlemmer</strong>
            <div className="tiny muted">
              Administratorer styrer selskapet og inviterer. Standard bruker agentene.
            </div>
          </div>
          {isAdmin && (
            <button className="button secondary" onClick={() => setOpen(true)}>
              Inviter medlem
            </button>
          )}
        </div>

        {warning && (
          <div className="banner warning" style={{ margin: "16px 24px 0" }}>
            {warning}
          </div>
        )}

        {link && (
          <div className="banner info" style={{ margin: "16px 24px 0" }}>
            <div style={{ marginBottom: 8 }}>
              Invitasjonen er sendt på e-post. Kommer den ikke fram — eller
              virker ikke lenken i den — send denne i stedet. Den virker like
              godt i en melding eller en SMS.
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

        <table className="table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>E-post</th>
              <th style={{ width: 150 }}>Rolle</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td style={{ fontWeight: 550 }}>{member.full_name ?? "—"}</td>
                <td className="muted">{member.email}</td>
                <td>
                  <span className={`pill ${member.role === "admin" ? "bekrefta" : ""}`}>
                    {USER_ROLE_LABELS[member.role]}
                  </span>
                </td>
                <td />
              </tr>
            ))}

            {pending.map((invitation) => (
              <tr key={invitation.id}>
                <td className="muted">Venter på at de logger inn</td>
                <td className="muted">{invitation.email}</td>
                <td>
                  <span className="pill utkast_klar">
                    {USER_ROLE_LABELS[invitation.role]} · invitert
                  </span>
                </td>
                <td>
                  {isAdmin && (
                    <button className="button danger" onClick={() => withdraw(invitation)}>
                      Trekk
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {pending.length > 0 && (
          <div className="tiny muted" style={{ padding: "0 24px 18px" }}>
            Invitasjoner utløper {formatDate(pending[0].expires_at)}.
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Inviter medlem">
        <form onSubmit={invite}>
          {error && <div className="banner error">{error}</div>}

          <label className="field">
            <span className="label">E-post</span>
            <input
              className="input"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kollega@firma.no"
            />
          </label>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Rolle</span>
            <select
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="standard">Standard</option>
              <option value="admin">Administrator</option>
            </select>
            <span className="hint">
              {role === "admin"
                ? "Kan endre selskapsinnstillinger og invitere flere."
                : "Kan bruke agentene, men ikke endre selskapet."}
            </span>
          </label>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy}>
              {busy ? "Sender…" : "Send invitasjon"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
