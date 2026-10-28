"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface Kollega {
  id: string;
  navn: string;
}

type Felt = "saksbehandler_id" | "hovedansvarlig_id";

/**
 * Saksbehandler og hovedansvarlig på ordren, som i PowerOffice Go.
 *
 * Står et felt tomt, gjelder forslaget: den som opprettet ordren. Det vises
 * grått og kursivt, og man velger bare en annen for å overstyre. Lagres med
 * én gang.
 */
export function OrdreAnsvar({
  orderId,
  saksbehandlerId,
  hovedansvarligId,
  forslag,
  kolleger,
}: {
  orderId: string;
  saksbehandlerId: string | null;
  hovedansvarligId: string | null;
  /** Den som opprettet ordren — forslaget i begge feltene. */
  forslag: Kollega | null;
  kolleger: Kollega[];
}) {
  const router = useRouter();
  const [verdier, setVerdier] = useState<Record<Felt, string>>({
    saksbehandler_id: saksbehandlerId ?? "",
    hovedansvarlig_id: hovedansvarligId ?? "",
  });
  const [busy, setBusy] = useState<Felt | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lagre(felt: Felt, verdi: string) {
    const forrige = verdier[felt];
    setVerdier((v) => ({ ...v, [felt]: verdi }));
    setBusy(felt);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [felt]: verdi || null }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      router.refresh();
    } catch (err) {
      setVerdier((v) => ({ ...v, [felt]: forrige }));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // Den som opprettet ordren står som forslag; resten av selskapet under.
  const andre = kolleger.filter((k) => k.id !== forslag?.id);

  const velger = (felt: Felt, etikett: string) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <select
        className={`input${verdier[felt] ? "" : " forslag-valg"}`}
        value={verdier[felt]}
        disabled={busy === felt}
        onChange={(e) => void lagre(felt, e.target.value)}
        title={verdier[felt] ? undefined : "Forslag: den som opprettet ordren. Velg en annen for å overstyre."}
      >
        <option value="">{forslag ? forslag.navn : "Ikke valgt"}</option>
        {forslag && <option value={forslag.id}>{forslag.navn}</option>}
        {andre.map((k) => (
          <option key={k.id} value={k.id}>
            {k.navn}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="card card-pad ordre-ansvar">
      <span className="label">Ansvar</span>
      {error && <div className="banner error">{error}</div>}
      {velger("saksbehandler_id", "Saksbehandler")}
      {velger("hovedansvarlig_id", "Hovedansvarlig")}
    </div>
  );
}
