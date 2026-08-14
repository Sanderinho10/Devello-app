"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * To måtar å logge inn på.
 *
 * Passord er hovudvegen: tilbudsagenten er eit verktøy folk opnar fleire gonger
 * om dagen, og då er ei e-postlenkje kvar gong berre friksjon. Lenkje er med som
 * alternativ for fyrste gongs pålogging og for dei som ikkje vil ha eit passord.
 */
type Mode = "passord" | "lenkje";

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
          Vi sende ei innloggingslenkje til {email}.
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
            : "Vi sender deg ei lenkje på e-post."}
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
              ? "Loggar inn…"
              : "Sender…"
            : mode === "passord"
              ? "Logg inn"
              : "Send lenkje"}
        </button>

        <button
          type="button"
          className="button ghost"
          style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          onClick={() => {
            setMode(mode === "passord" ? "lenkje" : "passord");
            setError(null);
          }}
        >
          {mode === "passord"
            ? "Send meg ei lenkje i staden"
            : "Bruk passord i staden"}
        </button>
      </form>
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

/** Supabase svarar på engelsk. Dei vanlegaste meldingane fortener norsk. */
function translate(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Feil e-post eller passord.";
  }
  if (lower.includes("email rate limit") || lower.includes("rate limit")) {
    return "For mange e-postar sendt. Vent litt, eller logg inn med passord i staden.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-posten er ikkje stadfesta enno.";
  }
  return message;
}
