"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sender" | "sendt" | "feil">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sender");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/tilbud/leads`,
      },
    });
    if (error) {
      setError(error.message);
      setState("feil");
    } else {
      setState("sendt");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="card card-pad" style={{ width: 380 }}>
        <div className="brand" style={{ padding: "0 0 18px" }}>
          <span className="brand-mark">D</span> Devello
        </div>

        {state === "sendt" ? (
          <>
            <h2>Sjekk e-posten</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              Vi sende ei innloggingslenkje til {email}.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2>Logg inn</h2>
            <p className="muted" style={{ margin: "6px 0 18px" }}>
              Vi sender deg ei lenkje på e-post.
            </p>

            {state === "feil" && <div className="banner error">{error}</div>}

            <label className="field">
              <span className="label">E-post</span>
              <input
                className="input"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deg@firma.no"
              />
            </label>

            <button
              className="button"
              type="submit"
              disabled={state === "sender"}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {state === "sender" ? "Sender…" : "Send lenkje"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
