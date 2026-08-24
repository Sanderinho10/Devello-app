"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Knappen som faktisk logger inn.
 *
 * Serveren veksler vårt token i et Supabase-token, og nettleseren veksler det
 * i en sesjon. Delingen er med vilje: sesjonen må settes i nettleseren for at
 * Supabase-klienten skal ha den, og vårt token må brukes opp på serveren for
 * at det skal kunne brukes bare én gang.
 */
export function BrukLenke({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loggInn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/lenke/bruk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke logge inn.");

      const { error: verifyError } = await supabaseBrowser().auth.verifyOtp({
        token_hash: payload.token_hash,
        type: "magiclink",
      });
      if (verifyError) throw new Error(verifyError.message);

      router.push("/tilbud/leads");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Logg inn</h2>
      <p className="muted" style={{ margin: "8px 0 18px" }}>
        Trykk under, så er du inne.
      </p>

      {error && <div className="banner error">{error}</div>}

      <button
        className="button"
        style={{ width: "100%", justifyContent: "center" }}
        onClick={loggInn}
        disabled={busy}
      >
        {busy ? "Logger inn…" : "Logg inn"}
      </button>

      <p className="muted tiny" style={{ marginTop: 20 }}>
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Logg inn med passord i stedet
        </Link>
      </p>
    </>
  );
}
