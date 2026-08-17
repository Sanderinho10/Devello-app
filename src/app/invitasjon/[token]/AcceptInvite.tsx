"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export function AcceptInvite({
  token,
  email,
  selskap,
}: {
  token: string;
  email: string;
  selskap: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== repeat) {
      setError("Passordene er ikke like.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invitations/aktiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, full_name: fullName }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke fullføre");

      // Logg inn med én gang. Feiler det, er kontoen uansett klar.
      const { error: loginError } = await supabaseBrowser().auth.signInWithPassword({
        email,
        password,
      });
      if (loginError) {
        router.push("/login");
        return;
      }
      router.push("/tilbud/leads");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>Bli med i {selskap}</h2>
      <p className="muted" style={{ margin: "6px 0 18px" }}>
        Velg et passord, så er du inne. Brukeren din blir <strong>{email}</strong>.
      </p>

      {error && <div className="banner error">{error}</div>}

      <label className="field">
        <span className="label">Navn</span>
        <input
          className="input"
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>

      <label className="field">
        <span className="label">Passord</span>
        <input
          className="input"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="hint">Minst åtte tegn.</span>
      </label>

      <label className="field">
        <span className="label">Gjenta passord</span>
        <input
          className="input"
          type="password"
          required
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>

      <button
        className="button"
        type="submit"
        style={{ width: "100%", justifyContent: "center" }}
        disabled={busy}
      >
        {busy ? "Setter opp…" : "Bli med"}
      </button>
    </form>
  );
}
