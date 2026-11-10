"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lagrelinje, Panel, Rad } from "./Panel";

/**
 * Standardpåslaget på materiell.
 *
 * Kopieres inn på hver materiellinje når den legges til, og kan overstyres
 * der. Endres standarden, rører det ikke linjene som alt er ført — de er
 * det montøren faktisk avtalte.
 */
export function PaaslagForm({ paaslag, erAdmin }: { paaslag: number; erAdmin: boolean }) {
  const router = useRouter();
  const [verdi, setVerdi] = useState(String(paaslag));
  const [lagret, setLagret] = useState(String(paaslag));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/order-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_markup_pct: Number(verdi.replace(",", ".")) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setLagret(String(payload.materials_markup_pct));
      setVerdi(String(payload.materials_markup_pct));
      setOk(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const eksempel = Number(verdi.replace(",", "."));

  return (
    <form onSubmit={lagre}>
      <Panel
        tittel="Påslag"
        hint="Legges på nettoprisen fra grossisten når materiell føres på en ordre."
        bunn={
          <Lagrelinje
            endret={verdi !== lagret}
            busy={busy}
            lagret={ok}
            onAngre={() => setVerdi(lagret)}
            kanEndre={erAdmin}
            ikkeAdmin="Bare administratorer kan endre påslaget."
          />
        }
      >
        {error && <div className="banner error">{error}</div>}
        <Rad
          etikett="Standardpåslag"
          hint={
            Number.isFinite(eksempel) && eksempel >= 0
              ? `En vare til 100 kr netto føres til ${(100 * (1 + eksempel / 100)).toLocaleString("nb-NO", { maximumFractionDigits: 2 })} kr. Kan overstyres per linje; linjer som alt er ført, endres ikke.`
              : "Kan overstyres per linje. Linjer som alt er ført, endres ikke."
          }
        >
          <span className="inst-med-enhet">
            <input
              className="input"
              inputMode="decimal"
              value={verdi}
              onChange={(e) => {
                setVerdi(e.target.value);
                setOk(false);
              }}
              disabled={!erAdmin}
            />
            <span className="muted">%</span>
          </span>
        </Rad>
      </Panel>
    </form>
  );
}
