"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Merke } from "@/components/Merke";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Velg nytt passord. Hit kommer man fra «Glemt passord»-lenken, som alt har
 * logget en inn — så her trengs bare det nye passordet, ikke det gamle.
 * Uten innlogging sier siden fra og sender til innloggingen.
 */
export default function NyttPassordPage() {
  const router = useRouter();
  const [epost, setEpost] = useState<string | null | undefined>(undefined);
  const [passord, setPassord] = useState("");
  const [gjenta, setGjenta] = useState("");
  const [busy, setBusy] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => setEpost(data.user?.email ?? null))
      .catch(() => setEpost(null));
  }, []);

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    if (passord.length < 8) {
      setFeil("Passordet må ha minst åtte tegn.");
      return;
    }
    if (passord !== gjenta) {
      setFeil("Passordene er ikke like.");
      return;
    }
    setBusy(true);
    setFeil(null);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password: passord });
      if (error) throw new Error(oversett(error.message));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <Merke size={24} /> Devello
        </div>

        {epost === undefined ? (
          <p className="muted">Et øyeblikk …</p>
        ) : epost === null ? (
          <>
            <h2>Lenken er brukt opp</h2>
            <p className="muted" style={{ margin: "8px 0 18px" }}>
              Du er ikke logget inn. Be om en ny lenke under «Glemt passord?» på innloggingssiden.
            </p>
            <Link className="button" style={{ width: "100%", justifyContent: "center" }} href="/login">
              Til innlogging
            </Link>
          </>
        ) : (
          <form onSubmit={lagre}>
            <h2>Velg nytt passord</h2>
            <p className="muted" style={{ margin: "6px 0 18px" }}>
              For <strong>{epost}</strong>. Minst åtte tegn.
            </p>
            {feil && <div className="banner error">{feil}</div>}
            <label className="field">
              <span className="label">Nytt passord</span>
              <input
                className="input"
                type="password"
                autoFocus
                required
                autoComplete="new-password"
                value={passord}
                onChange={(e) => setPassord(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Gjenta passordet</span>
              <input
                className="input"
                type="password"
                required
                autoComplete="new-password"
                value={gjenta}
                onChange={(e) => setGjenta(e.target.value)}
              />
            </label>
            <button className="button" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Lagrer…" : "Lagre passord og logg inn"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/** Supabase svarer på engelsk. */
function oversett(melding: string): string {
  const m = melding.toLowerCase();
  if (m.includes("should be different")) return "Det nye passordet må være forskjellig fra det gamle.";
  if (m.includes("weak") || m.includes("at least")) return "Passordet er for svakt. Bruk minst åtte tegn, gjerne med tall.";
  if (m.includes("session") || m.includes("not authenticated")) return "Du er ikke logget inn lenger. Be om en ny lenke.";
  return melding;
}
