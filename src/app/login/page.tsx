"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * To måter å logge inn på.
 *
 * Passord er hovedveien: tilbudsagenten er et verktøy folk åpner flere ganger
 * om dagen, og da er en e-postlenke hver gang bare friksjon. Lenke er med som
 * alternativ for første gangs pålogging og for de som ikke vil ha et passord.
 */
type Mode = "passord" | "lenke";

export default function LoginPage() {
  return (
    <Suspense fallback={<Shell><h2>Logg inn</h2></Shell>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("passord");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    // En lenke som ikke gikk gjennom sender brukeren hit med grunnen. Uten
    // dette ville de sett et vanlig innloggingsskjema og ingen forklaring.
    params.get("feil"),
  );

  /**
   * Har vi allerede en sesjon, skal ingen se dette skjemaet.
   *
   * Bekreftelseslenken fra e-posten sender kunden hit med sesjonen liggende i
   * adressen (#access_token=…). Supabase-klienten plukker den opp når den
   * starter, og da er kunden logget inn — men uten dette ville de blitt
   * stående og se på et innloggingsskjema de ikke lenger trengte.
   */
  useEffect(() => {
    let avbrutt = false;
    (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getSession();
        if (!avbrutt && data.session) {
          router.replace("/tilbud/leads");
        }
      } catch {
        // Mangler oppsettet, sier skjemaet fra når noen prøver å logge inn.
      }
    })();
    return () => {
      avbrutt = true;
    };
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    // Alt ligger i try/catch: kastet noe her før, satte ingen busy tilbake,
    // og knappen ble stående på «Logger inn…» for alltid uten å si hvorfor.
    try {
      const supabase = supabaseBrowser();

      if (mode === "passord") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(translate(error.message));
          setBusy(false);
          return;
        }
        router.push("/tilbud/leads");
        router.refresh();
        return;
      }

      // Vår egen rute, ikke supabase.auth.signInWithOtp.
      //
      // Supabase svarer 200 på /otp uansett hva som skjer med e-posten
      // etterpå, så skjermen sa «Sjekk e-posten» tre ganger på rad mens
      // ingenting kom fram. Herfra får vi vite om meldingen faktisk gikk ut,
      // og kan si det hvis den ikke gjorde det. Se 0026.
      const res = await fetch("/api/auth/lenke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(payload.error ?? "Kunne ikke sende lenken.");
      } else {
        setSent(true);
      }
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell>
        <h2>Sjekk e-posten</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Vi sendte en innloggingslenke til {email}.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit}>
        <h2>Logg inn</h2>
        <p className="muted" style={{ margin: "6px 0 18px" }}>
          {mode === "passord"
            ? "Med e-post og passord."
            : "Vi sender deg en lenke på e-post."}
        </p>

        {error && <div className="banner error">{error}</div>}

        <label className="field">
          <span className="label">E-post</span>
          <input
            className="input"
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deg@firma.no"
          />
        </label>

        {mode === "passord" && (
          <label className="field">
            <span className="label">Passord</span>
            <input
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        <button
          className="button"
          type="submit"
          disabled={busy}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {busy
            ? mode === "passord"
              ? "Logger inn…"
              : "Sender…"
            : mode === "passord"
              ? "Logg inn"
              : "Send lenke"}
        </button>

        <button
          type="button"
          className="button ghost"
          style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          onClick={() => {
            setMode(mode === "passord" ? "lenke" : "passord");
            setError(null);
          }}
        >
          {mode === "passord"
            ? "Send meg en lenke i stedet"
            : "Bruk passord i stedet"}
        </button>
      </form>

      <div className="auth-divider" />

      <p className="muted tiny" style={{ textAlign: "center" }}>
        Ny hos Devello?{" "}
        <Link href="/registrer" style={{ textDecoration: "underline" }}>
          Opprett konto
        </Link>
      </p>

      <p className="muted tiny" style={{ textAlign: "center", marginTop: 8 }}>
        Er du regnskapsfører for bygg- og anleggsbedrifter?{" "}
        <Link href="/partner" style={{ textDecoration: "underline" }}>
          Bli partner
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad" style={{ width: 380 }}>
        <div className="brand" style={{ padding: "0 0 18px" }}>
          <span className="brand-mark">D</span> Devello
        </div>
        {children}
      </div>
    </div>
  );
}

/** Supabase svarer på engelsk. De vanligste meldingene fortjener norsk. */
function translate(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Feil e-post eller passord.";
  }
  if (lower.includes("email rate limit") || lower.includes("rate limit")) {
    return "For mange e-poster sendt. Vent litt, eller logg inn med passord i stedet.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-posten er ikke bekreftet ennå.";
  }
  return message;
}
