"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("passord");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/tilbud/leads` },
    });
    if (error) {
      setError(translate(error.message));
    } else {
      setSent(true);
    }
    setBusy(false);
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
