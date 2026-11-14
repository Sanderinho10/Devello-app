"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { StockLocation } from "@/lib/types";

/**
 * Ny bil eller nytt lager — eller endre en som finnes. Samme skjema; med
 * `lager` satt er det en endring.
 *
 * Nummeret velges ikke: det deles ut fra samme serie som ordrene, så et
 * nummer på en grossistfaktura aldri kan bety to ting.
 */
export function LagerSkjema({
  lager,
  medlemmer,
  onLukk,
  onLagra,
}: {
  lager?: StockLocation;
  medlemmer: { id: string; navn: string }[];
  onLukk: () => void;
  onLagra: (lager: StockLocation) => void;
}) {
  const [name, setName] = useState(lager?.name ?? "");
  const [kind, setKind] = useState(lager?.kind ?? "bil");
  const [regNo, setRegNo] = useState(lager?.reg_no ?? "");
  const [userId, setUserId] = useState(lager?.user_id ?? "");
  const [note, setNote] = useState(lager?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(lager ? `/api/lager/${lager.id}` : "/api/lager", {
        method: lager ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, reg_no: regNo, user_id: userId, note }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      onLagra(payload as StockLocation);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onLukk()} title={lager ? `Endre ${lager.name}` : "Ny bil eller lager"}>
      <form onSubmit={lagre}>
        {error && <div className="banner error">{error}</div>}
        <div className="kontakt-panel ny-post-panel">
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Type</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "bil" | "lager")}>
              <option value="bil">Bil</option>
              <option value="lager">Lager</option>
            </select>
          </label>
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Navn</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "bil" ? "Bilen til Martin" : "Hovedlager"}
              autoFocus
              required
            />
          </label>
          {kind === "bil" && (
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Reg.nr.</span>
              <span className="kort-felt">
                <input className="input" value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="Valgfritt" />
              </span>
            </label>
          )}
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">{kind === "bil" ? "Montør" : "Ansvarlig"}</span>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Ingen fast</option>
              {medlemmer.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.navn}
                </option>
              ))}
            </select>
          </label>
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Merknad</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Valgfritt" />
          </label>
          {kind === "bil" && (
            <div className="kontakt-rad">
              <span />
              <span className="hint" style={{ marginTop: -4 }}>
                Montøren får denne bilen foreslått når han fører materiell fra bil på en ordre.
              </span>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onLukk} disabled={busy}>
            Avbryt
          </button>
          <button className="button" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Lagrer…" : lager ? "Lagre" : "Opprett"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
