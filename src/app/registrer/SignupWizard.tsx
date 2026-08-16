"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatOrgNr } from "@/lib/onboarding/orgnr";

/**
 * Registrering i tre steg: selskapet, brukeren, og i gang.
 *
 * Alt samles opp i skjemaet og sendes i ett kall til slutt. Alternativet —
 * å opprette selskapet på steg 1 og brukeren på steg 2 — ville etterlatt
 * halve kontoer hver gang noen ombestemte seg underveis.
 *
 * Organisasjonsnummeret sjekkes likevel allerede på steg 1. Å oppdage at
 * nummeret er opptatt etter at man har fylt ut alt, er en dårlig opplevelse
 * for noe vi kan si fra om med én gang.
 */
type Step = 1 | 2 | 3;

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    org_nr: "",
    billing_address_line: "",
    billing_postal_code: "",
    billing_city: "",
    full_name: "",
    email: "",
    password: "",
    password_repeat: "",
    partner_code: "",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function nextFromOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/check-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_nr: form.org_nr }),
      });
      const payload = await res.json();
      if (!payload.available) {
        throw new Error(payload.error ?? "Organisasjonsnummeret kan ikke brukes.");
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function nextFromUser(event: React.FormEvent) {
    event.preventDefault();
    if (form.password !== form.password_repeat) {
      setError("Passordene er ikke like.");
      return;
    }
    if (form.password.length < 8) {
      setError("Passordet må ha minst åtte tegn.");
      return;
    }
    setError(null);
    setStep(3);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette kontoen");

      // Krever oppsettet bekreftelse, finnes det ingen sesjon å logge inn med
      // ennå. Å prøve ville gitt «E-posten er ikke bekreftet» — en feilmelding
      // for noe som gikk helt etter planen.
      if (payload.requires_confirmation) {
        setAwaitingConfirmation(true);
        setBusy(false);
        return;
      }

      // Logg inn med én gang. Kontoen er opprettet uansett, så en feil her
      // betyr bare at de må logge inn selv.
      const { error: loginError } = await supabaseBrowser().auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (loginError) {
        router.push("/login");
        return;
      }

      router.push("/tilbud/innstillinger");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="auth-shell">
        <div className="card card-pad auth-card">
          <div className="brand" style={{ padding: "0 0 20px" }}>
            <span className="brand-mark">D</span> Devello
          </div>

          <h2>Sjekk e-posten</h2>
          <p className="muted" style={{ margin: "8px 0 18px" }}>
            Kontoen for <strong>{form.company_name}</strong> er opprettet. Vi har
            sendt en bekreftelseslenke til <strong>{form.email}</strong> — trykk
            på den, så er du inne.
          </p>
          <p className="hint">
            Finner du den ikke, sjekk søppelpost. Lenken er gyldig i 24 timer.
          </p>

          <p className="muted tiny" style={{ marginTop: 20 }}>
            <Link href="/login" style={{ textDecoration: "underline" }}>
              Til innlogging
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <span className="brand-mark">D</span> Devello
        </div>

        <ol className="wizard-steps">
          {["Organisasjon", "Din bruker", "Kom i gang"].map((label, index) => {
            const number = (index + 1) as Step;
            return (
              <li
                key={label}
                className={`wizard-step${number === step ? " active" : ""}${
                  number < step ? " done" : ""
                }`}
              >
                <span className="wizard-step-number">{number < step ? "✓" : number}</span>
                {label}
              </li>
            );
          })}
        </ol>

        {error && <div className="banner error">{error}</div>}

        {step === 1 && (
          <form onSubmit={nextFromOrg}>
            <h2>Organisasjonen</h2>
            <p className="muted" style={{ margin: "6px 0 18px" }}>
              Vi starter med selskapet. Du setter opp din egen bruker i neste steg.
            </p>

            <label className="field">
              <span className="label">Selskapsnavn</span>
              <input
                className="input"
                required
                autoFocus
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                placeholder="Star Elektro AS"
              />
            </label>

            <label className="field">
              <span className="label">Organisasjonsnummer</span>
              <input
                className="input"
                required
                inputMode="numeric"
                value={form.org_nr}
                onChange={(e) => set("org_nr", e.target.value)}
                onBlur={(e) => set("org_nr", formatOrgNr(e.target.value))}
                placeholder="912 345 678"
              />
              <span className="hint">Ni siffer. Vi sjekker at det ikke alt er i bruk.</span>
            </label>

            <label className="field">
              <span className="label">Fakturaadresse</span>
              <input
                className="input"
                required
                value={form.billing_address_line}
                onChange={(e) => set("billing_address_line", e.target.value)}
                placeholder="Storgata 14"
              />
            </label>

            <div className="grid-2">
              <label className="field">
                <span className="label">Postnummer</span>
                <input
                  className="input"
                  required
                  inputMode="numeric"
                  value={form.billing_postal_code}
                  onChange={(e) => set("billing_postal_code", e.target.value)}
                  placeholder="6800"
                />
              </label>
              <label className="field">
                <span className="label">Poststed</span>
                <input
                  className="input"
                  required
                  value={form.billing_city}
                  onChange={(e) => set("billing_city", e.target.value)}
                  placeholder="Førde"
                />
              </label>
            </div>

            <button className="button wizard-submit" type="submit" disabled={busy}>
              {busy ? "Sjekker…" : "Neste"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={nextFromUser}>
            <h2>Din bruker</h2>

            <div className="banner info" style={{ marginTop: 12 }}>
              Du setter opp din egen bruker nå, og blir <strong>administrator</strong>{" "}
              for {form.company_name || "selskapet"}. Når alt er på plass, kan du
              invitere kollegene dine inn.
            </div>

            <label className="field">
              <span className="label">Navn</span>
              <input
                className="input"
                required
                autoFocus
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Ola Nordmann"
              />
            </label>

            <label className="field">
              <span className="label">E-post</span>
              <input
                className="input"
                type="email"
                required
                autoComplete="username"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="ola@firma.no"
              />
            </label>

            <div className="grid-2">
              <label className="field">
                <span className="label">Passord</span>
                <input
                  className="input"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Gjenta passord</span>
                <input
                  className="input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password_repeat}
                  onChange={(e) => set("password_repeat", e.target.value)}
                />
              </label>
            </div>
            <span className="hint">Minst åtte tegn.</span>

            <div className="wizard-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(1)}
              >
                Tilbake
              </button>
              <button className="button" type="submit">
                Neste
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={submit}>
            <h2>Kom i gang</h2>

            <div className="banner success" style={{ marginTop: 12 }}>
              Du starter med <strong>én måned gratis</strong>. Ingen betaling nå, og
              ingenting blir trukket automatisk. Som administrator velger du pakke i
              løpet av prøveperioden eller etter at den er ute.
            </div>

            <label className="field" style={{ marginTop: 18 }}>
              <span className="label">Regnskapsførerkode (valgfritt)</span>
              <input
                className="input"
                value={form.partner_code}
                onChange={(e) => set("partner_code", e.target.value.toUpperCase())}
                placeholder="DEV-XXXXXX"
              />
              <span className="hint">
                Har regnskapsføreren din anbefalt Devello, legg inn koden deres her.{" "}
                <Link href="/partner" className="drop-link">
                  Er du regnskapsfører selv?
                </Link>
              </span>
            </label>

            <div className="wizard-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(2)}
                disabled={busy}
              >
                Tilbake
              </button>
              <button className="button" type="submit" disabled={busy}>
                {busy ? "Oppretter…" : "Opprett konto"}
              </button>
            </div>
          </form>
        )}

        <p className="muted tiny" style={{ marginTop: 20 }}>
          Har du konto fra før?{" "}
          <Link href="/login" style={{ textDecoration: "underline" }}>
            Logg inn
          </Link>
        </p>
      </div>
    </div>
  );
}
