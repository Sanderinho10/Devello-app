"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Invitasjon til en som alt har Devello-bruker i et annet selskap. De logger
 * inn med sitt vanlige passord og trykker «Bli med»; selskapet legges til,
 * og de kan bytte mellom selskapene i menyen. Passordet røres aldri her.
 */
export function BliMed({
  token,
  email,
  selskap,
  innlogget,
}: {
  token: string;
  email: string;
  selskap: string;
  /** Adressen som er logget inn nå, om noen. */
  innlogget: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const riktig = innlogget?.toLowerCase() === email.toLowerCase();
  const tilbake = `/login?neste=${encodeURIComponent(`/invitasjon/${token}`)}`;

  async function godta() {
    setBusy(true);
    setFeil(null);
    try {
      const res = await fetch("/api/invitations/godta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke godta invitasjonen");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Bli med i {selskap}</h2>
      <p className="muted" style={{ margin: "6px 0 18px" }}>
        Du har allerede en Devello-bruker på <strong>{email}</strong>. Når du blir med, kan du bytte mellom selskapene
        øverst i menyen — uten å logge ut.
      </p>
      {feil && <div className="banner error">{feil}</div>}
      {riktig ? (
        <button type="button" className="button" style={{ width: "100%", justifyContent: "center" }} onClick={godta} disabled={busy}>
          {busy ? "Legger til…" : `Bli med i ${selskap}`}
        </button>
      ) : (
        <>
          {innlogget && (
            <div className="banner warning">
              Du er logget inn som {innlogget}. Logg inn som {email} for å godta.
            </div>
          )}
          <Link className="button" style={{ width: "100%", justifyContent: "center" }} href={tilbake}>
            Logg inn for å bli med
          </Link>
        </>
      )}
    </>
  );
}
