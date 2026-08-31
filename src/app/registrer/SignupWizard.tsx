"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizeOrgNr } from "@/lib/onboarding/orgnr";
import { Merke } from "@/components/Merke";

/**
 * Registrering i fire steg: selskapet, brukeren, profilen på tilbudene, og i
 * gang.
 *
 * Alt samles opp i skjemaet og sendes i ett kall til slutt. Alternativet —
 * å opprette selskapet på steg 1 og brukeren på steg 2 — ville etterlatt
 * halve kontoer hver gang noen ombestemte seg underveis.
 *
 * Organisasjonsnummeret sjekkes likevel allerede på steg 1. Å oppdage at
 * nummeret er opptatt etter at man har fylt ut alt, er en dårlig opplevelse
 * for noe vi kan si fra om med én gang.
 */
type Step = 1 | 2 | 3 | 4;

const MAKS_LOGO_BYTES = 2 * 1024 * 1024;

const LOGO_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

/**
 * Base64 i biter.
 *
 * String.fromCharCode(...bytes) på en 2 MB-fil sprenger kallstakken — det er
 * over to millioner argumenter i ett kall.
 */
async function tilBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binaer = "";
  const bit = 0x8000;
  for (let i = 0; i < bytes.length; i += bit) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + bit));
  }
  return btoa(binaer);
}

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

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
    maalform: "nb",
    primary_color: "#1d1d1f",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    website: "",
  });

  // Logoen holdes i minnet til kontoen finnes. /api/brand/logo krever sesjon,
  // og den har vi ikke ennå — så fila sendes med registreringen i stedet.
  const [logo, setLogo] = useState<File | null>(null);

  // Kontaktfeltene i steg 3 fylles én gang fra steg 2. I et enmannsfirma er
  // det den samme personen, og da er halve steget gjort før de kommer dit.
  // Én gang, ikke hver gang: har de tømt feltet med vilje, skal det holde
  // seg tomt når de går fram og tilbake.
  const kontaktSaadd = useRef(false);

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

    if (!kontaktSaadd.current) {
      kontaktSaadd.current = true;
      setForm((current) => ({
        ...current,
        contact_name: current.contact_name || current.full_name,
        contact_email: current.contact_email || current.email,
      }));
    }

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
        body: JSON.stringify({
          ...form,
          brand: {
            maalform: form.maalform,
            primary_color: form.primary_color,
            contact_name: form.contact_name,
            contact_email: form.contact_email,
            contact_phone: form.contact_phone,
            website: form.website,
            logo: logo
              ? {
                  data: await tilBase64(logo),
                  filnavn: logo.name,
                  mime: logo.type,
                }
              : undefined,
          },
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke opprette kontoen");

      // Krever oppsettet bekreftelse, finnes det ingen sesjon å logge inn med
      // ennå. Å prøve ville gitt «E-posten er ikke bekreftet» — en feilmelding
      // for noe som gikk helt etter planen.
      if (payload.requires_confirmation) {
        setEmailError(payload.email_error ?? null);
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
            <Merke size={24} /> Devello
          </div>

          {emailError ? (
            <>
              <h2>Kontoen er opprettet</h2>
              <div className="banner warning" style={{ margin: "8px 0 18px" }}>
                Kontoen for <strong>{form.company_name}</strong> er klar, men
                bekreftelseslenken til <strong>{form.email}</strong> kom ikke
                av gårde: {emailError}
              </div>
              <p className="hint">
                Prøv «Send meg en lenke i stedet» på innloggingssiden — den
                bekrefter e-posten på samme måte.
              </p>
            </>
          ) : (
            <>
              <h2>Sjekk e-posten</h2>
              <p className="muted" style={{ margin: "8px 0 18px" }}>
                Kontoen for <strong>{form.company_name}</strong> er opprettet. Vi
                har sendt en bekreftelseslenke til <strong>{form.email}</strong> —
                trykk på den, så er du inne.
              </p>
              <p className="hint">
                Finner du den ikke, sjekk søppelpost. Lenken er gyldig i 24 timer.
              </p>
            </>
          )}

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
          <Merke size={24} /> Devello
        </div>

        <ol className="wizard-steps">
          {["Organisasjon", "Din bruker", "Profil", "Kom i gang"].map((label, index) => {
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
              />
            </label>

            <label className="field">
              <span className="label">Organisasjonsnummer</span>
              <input
                className="input"
                required
                inputMode="numeric"
                value={form.org_nr}
                // Bare sifre inn i feltet. Mellomrom og punktum er den
                // vanligste kilden til «samme selskap, to skrivemåter».
                onChange={(e) => set("org_nr", normalizeOrgNr(e.target.value).slice(0, 9))}
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
                />
              </label>
              <label className="field">
                <span className="label">Poststed</span>
                <input
                  className="input"
                  required
                  value={form.billing_city}
                  onChange={(e) => set("billing_city", e.target.value)}
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
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setStep(4);
            }}
          >
            <h2>Profil på tilbudene</h2>
            <p className="muted" style={{ margin: "6px 0 18px" }}>
              Logo, farge og kontaktinfo som blir lagt inn i tilbudene agenten
              lager. Alt kan stå tomt og fylles ut senere under Selskap →
              Detaljer — men det er lettere å gjøre nå enn å oppdage det på det
              første tilbudet som går ut.
            </p>

            <LogoVelger fil={logo} velg={setLogo} feil={setError} />

            <div className="grid-2">
              <label className="field">
                <span className="label">Primærfarge</span>
                <div className="row">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(e) => set("primary_color", e.target.value)}
                    style={{
                      width: 44,
                      height: 38,
                      padding: 2,
                      border: "1px solid var(--border-strong)",
                      borderRadius: 8,
                      background: "var(--surface)",
                    }}
                  />
                  <input
                    className="input"
                    value={form.primary_color}
                    onChange={(e) => set("primary_color", e.target.value)}
                  />
                </div>
              </label>
              <label className="field">
                <span className="label">Målform</span>
                <select
                  className="select"
                  value={form.maalform}
                  onChange={(e) => set("maalform", e.target.value)}
                >
                  <option value="nb">Bokmål</option>
                  <option value="nn">Nynorsk</option>
                </select>
                <span className="hint">
                  All tekst agentene skriver til kundene deres.
                </span>
              </label>
            </div>

            <div className="grid-2">
              <label className="field">
                <span className="label">Kontaktperson</span>
                <input
                  className="input"
                  value={form.contact_name}
                  onChange={(e) => set("contact_name", e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Kontakt-e-post</span>
                <input
                  className="input"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => set("contact_email", e.target.value)}
                />
              </label>
            </div>

            <div className="grid-2">
              <label className="field">
                <span className="label">Telefon</span>
                <input
                  className="input"
                  value={form.contact_phone}
                  onChange={(e) => set("contact_phone", e.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Nettsted</span>
                <input
                  className="input"
                  value={form.website}
                  onChange={(e) => set("website", e.target.value)}
                />
              </label>
            </div>

            <div className="wizard-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(2)}
              >
                Tilbake
              </button>
              <button className="button" type="submit">
                Neste
              </button>
            </div>
          </form>
        )}

        {step === 4 && (
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
                onClick={() => setStep(3)}
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

/**
 * Logovelger som holder fila i minnet.
 *
 * BrandImageUpload laster opp med én gang, og det går ikke her: selskapet
 * finnes ikke ennå, og /api/brand/logo krever en sesjon. Denne holder fila til
 * registreringen sendes, med de samme tre veiene inn — dra, lim inn, velg.
 */
function LogoVelger({
  fil,
  velg,
  feil,
}: {
  fil: File | null;
  velg: (fil: File | null) => void;
  feil: (melding: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // Object-URL-en må ryddes opp, ellers holder nettleseren på fila til sida
  // lastes på nytt.
  const forhaandsvisning = useMemo(
    () => (fil ? URL.createObjectURL(fil) : null),
    [fil],
  );
  useEffect(() => {
    return () => {
      if (forhaandsvisning) URL.revokeObjectURL(forhaandsvisning);
    };
  }, [forhaandsvisning]);

  function taImot(valgt: File | undefined | null) {
    if (!valgt) return;
    if (!valgt.type.startsWith("image/")) {
      feil("Dette er ikke et bilde. PNG, JPG, WEBP, GIF eller SVG.");
      return;
    }
    if (valgt.size > MAKS_LOGO_BYTES) {
      feil("Logoen kan være opptil 2 MB. Skaler den ned først.");
      return;
    }
    feil(null);
    velg(valgt);
  }

  return (
    <div className="field">
      <span className="label">Logo (valgfritt)</span>

      {fil && forhaandsvisning ? (
        <div className="file-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={forhaandsvisning}
            alt=""
            style={{ height: 38, maxWidth: 220, objectFit: "contain" }}
          />
          <span className="file-row-name">{fil.name}</span>
          <button
            type="button"
            className="button ghost"
            onClick={() => inputRef.current?.click()}
          >
            Bytt
          </button>
          <button type="button" className="button ghost" onClick={() => velg(null)}>
            Fjern
          </button>
        </div>
      ) : (
        <div
          className={`drop${over ? " over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            taImot(event.dataTransfer.files[0]);
          }}
          onPaste={(event) => {
            const bilde = Array.from(event.clipboardData.files).find((f) =>
              f.type.startsWith("image/"),
            );
            if (!bilde) return;
            event.preventDefault();
            taImot(bilde);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Logo: dra inn, lim inn eller velg fil"
        >
          <span className="drop-icon">▦</span>
          <span>
            Dra inn logoen, lim inn med Ctrl+V, eller{" "}
            <span className="drop-link">velg en fil</span>
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT}
        hidden
        onChange={(event) => {
          taImot(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <span className="hint">
        PNG, JPG, WEBP eller SVG, opptil 2 MB. Står best med gjennomsiktig
        bakgrunn. Uten logo bruker tilbudet firmanavnet i tekst.
      </span>
    </div>
  );
}
