"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

/**
 * «Gi tilbakemelding» nederst i menyen. Går som e-post til Devello
 * (api/tilbakemelding), med kunden som svar-til.
 */
export function Tilbakemelding() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("onske");
  const [melding, setMelding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendt, setSendt] = useState(false);

  function lukk() {
    if (busy) return;
    setOpen(false);
    // Etter takk-meldingen starter neste gang på nytt; et halvskrevet utkast får stå.
    if (sendt) {
      setSendt(false);
      setMelding("");
      setType("onske");
    }
    setError(null);
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tilbakemelding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, melding, side: pathname }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke sende tilbakemeldingen.");
      setSendt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="nav-button" onClick={() => setOpen(true)}>
        <span className="nav-icon">✉</span>
        Gi tilbakemelding
      </button>

      <Modal open={open} onClose={lukk} title="Gi tilbakemelding">
        {sendt ? (
          <>
            <p style={{ margin: 0 }}>
              Takk! Meldingen er sendt rett til oss, og vi svarer på e-post.
            </p>
            <div className="modal-actions">
              <button className="button" onClick={lukk}>
                Lukk
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: "0 0 18px" }}>
              Noe som ikke virker, noe som mangler, eller noe du liker? Det går rett til oss.
            </p>

            {error && (
              <div className="banner error" style={{ marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div className="field">
              <label className="label" htmlFor="tilbakemelding-type">
                Hva gjelder det?
              </label>
              <select
                id="tilbakemelding-type"
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="onske">Ønske eller idé</option>
                <option value="feil">Noe virker ikke</option>
                <option value="annet">Annet</option>
              </select>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="label" htmlFor="tilbakemelding-melding">
                Melding
              </label>
              <textarea
                id="tilbakemelding-melding"
                className="textarea"
                value={melding}
                onChange={(e) => setMelding(e.target.value)}
                maxLength={5000}
                placeholder={
                  type === "feil"
                    ? "Hva gjorde du, og hva skjedde?"
                    : "Skriv fritt …"
                }
                autoFocus
              />
            </div>

            <div className="modal-actions">
              <button className="button secondary" onClick={lukk} disabled={busy}>
                Avbryt
              </button>
              <button className="button" onClick={send} disabled={busy || !melding.trim()}>
                {busy ? "Sender …" : "Send"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
