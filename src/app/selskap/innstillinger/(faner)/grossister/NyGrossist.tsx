"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

export function NyGrossist() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kundenr, setKundenr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function opprett(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/grossist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, customer_no: kundenr }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette");
      setOpen(false);
      setName("");
      setKundenr("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        Ny grossist
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ny grossist">
        <form onSubmit={opprett}>
          {error && <div className="banner error">{error}</div>}
          <label className="field">
            <span className="label">Navn</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Onninen" autoFocus required />
          </label>
          <label className="field">
            <span className="label">Kundenummer hos grossisten</span>
            <input className="input" value={kundenr} onChange={(e) => setKundenr(e.target.value)} placeholder="Valgfritt — står i prisfila" />
          </label>
          <div className="row">
            <button className="button" type="submit" disabled={busy || !name.trim()}>
              {busy ? "Oppretter…" : "Opprett"}
            </button>
            <button type="button" className="button ghost" onClick={() => setOpen(false)}>
              Avbryt
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
