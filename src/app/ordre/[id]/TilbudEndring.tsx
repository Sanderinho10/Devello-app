"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AutoTextarea } from "@/components/AutoTextarea";
import { Modal } from "@/components/Modal";
import { endringsNotat } from "@/lib/ordre/tilbudsendring";

interface Linje {
  seksjon: string;
  description: string;
  quantity: number;
  unit: string;
}

/**
 * «Meld endring» på tilbudet: hva ble annerledes enn det kunden sa ja til.
 *
 * Tilbudet på ordren er frosset. Antallene som rettes her — og kommentaren —
 * blir et notat på ordren, så kontoret ser det når jobben skal faktureres.
 */
export function TilbudEndring({ orderId, linjer }: { orderId: string; linjer: Linje[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [antall, setAntall] = useState<string[]>(() => linjer.map((l) => String(l.quantity).replace(".", ",")));
  const [kommentar, setKommentar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lagret, setLagret] = useState(false);

  const tekst = endringsNotat(
    linjer.map((l, i) => {
      const n = Number((antall[i] ?? "").replace(",", ".").trim());
      return { ...l, ny: (antall[i] ?? "").trim() === "" || !Number.isFinite(n) ? l.quantity : n };
    }),
    kommentar,
  );

  function lukk() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function lagre() {
    if (!tekst) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/notat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: tekst }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setOpen(false);
      setAntall(linjer.map((l) => String(l.quantity).replace(".", ",")));
      setKommentar("");
      setLagret(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="linkish" onClick={() => setOpen(true)}>
        {lagret ? "Endring lagret i notatene ✓ — meld en til" : "Meld endring"}
      </button>
      <Modal open={open} onClose={lukk} size="wide" title="Endringer fra tilbudet">
        <p className="tiny muted" style={{ marginTop: 0 }}>
          Rett antallet der jobben ble annerledes enn tilbudet, og skriv det som kom i tillegg. Tilbudet står som det
          er — endringene lagres som et notat på ordren.
        </p>
        {error && <div className="banner error">{error}</div>}
        <div className="tabell-rull">
          <table className="doc-table">
            <thead>
              <tr>
                <th>Beskrivelse</th>
                <th className="num">Tilbud</th>
                <th className="num">Ble</th>
                <th>Enhet</th>
              </tr>
            </thead>
            <tbody>
              {linjer.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td className="num">{String(l.quantity).replace(".", ",")}</td>
                  <td className="num">
                    <input
                      className="input"
                      inputMode="decimal"
                      style={{ width: 84, textAlign: "right" }}
                      value={antall[i] ?? ""}
                      aria-label={`Antall utført: ${l.description}`}
                      onChange={(e) => setAntall((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                    />
                  </td>
                  <td>{l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span className="label">Tillegg eller kommentar</span>
          <AutoTextarea value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="To ekstra stikk på kjøkkenet, avtalt med kunden på stedet." />
        </label>
        {tekst && (
          <div className="banner info" style={{ whiteSpace: "pre-wrap" }}>
            {tekst}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={lukk} disabled={busy}>
            Avbryt
          </button>
          <button type="button" className="button" onClick={lagre} disabled={busy || !tekst}>
            {busy ? "Lagrer…" : "Lagre som notat"}
          </button>
        </div>
      </Modal>
    </>
  );
}
