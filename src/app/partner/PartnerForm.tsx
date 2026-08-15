"use client";

import Link from "next/link";
import { useState } from "react";
import { formatOrgNr } from "@/lib/onboarding/orgnr";

/**
 * Regnskapsførere henter partnerkoden sin her.
 *
 * Koden gir andel av omsetningen fra kundene de verver. Ingen konto kreves —
 * en regnskapsfører som anbefaler oss til kundene sine er ikke nødvendigvis
 * bruker selv.
 */
export function PartnerForm() {
  const [form, setForm] = useState({
    name: "",
    org_nr: "",
    payout_account: "",
    contact_email: "",
    address_line: "",
    postal_code: "",
    city: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; existing: boolean } | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke registrere partneren");
      setResult({ code: payload.code, existing: Boolean(payload.existing) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="auth-shell">
        <div className="card card-pad auth-card">
          <div className="brand" style={{ padding: "0 0 20px" }}>
            <span className="brand-mark">D</span> Devello
          </div>

          <h2>{result.existing ? "Du er partner fra før" : "Du er registrert"}</h2>
          <p className="muted" style={{ margin: "6px 0 20px" }}>
            {result.existing
              ? "Dette organisasjonsnummeret er allerede registrert. Her er koden din."
              : "Gi denne koden til kundene dine. De legger den inn i siste steg når de oppretter konto."}
          </p>

          <div className="partner-code">{result.code}</div>

          <p className="hint" style={{ marginTop: 16 }}>
            Vi tar kontakt med detaljene rundt oppgjør. Har du spørsmål i mellomtiden,
            svar på e-posten du har oppgitt.
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

        <h2>Bli partner</h2>
        <p className="muted" style={{ margin: "6px 0 18px" }}>
          Er du regnskapsfører og anbefaler Devello til kundene dine, får du en andel
          av omsetningen de gir oss. Fyll ut, så får du koden med én gang.
        </p>

        {error && <div className="banner error">{error}</div>}

        <form onSubmit={submit}>
          <label className="field">
            <span className="label">Selskapsnavn</span>
            <input
              className="input"
              required
              autoFocus
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Førde Regnskap AS"
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
          </label>

          <label className="field">
            <span className="label">Utbetalingskonto</span>
            <input
              className="input"
              required
              inputMode="numeric"
              value={form.payout_account}
              onChange={(e) => set("payout_account", e.target.value)}
              placeholder="1234.56.78901"
            />
            <span className="hint">Elleve siffer. Hit går andelen din.</span>
          </label>

          <label className="field">
            <span className="label">Kontakt-e-post</span>
            <input
              className="input"
              type="email"
              required
              value={form.contact_email}
              onChange={(e) => set("contact_email", e.target.value)}
              placeholder="post@regnskap.no"
            />
          </label>

          <label className="field">
            <span className="label">Adresse</span>
            <input
              className="input"
              required
              value={form.address_line}
              onChange={(e) => set("address_line", e.target.value)}
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
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Poststed</span>
              <input
                className="input"
                required
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </label>
          </div>

          <button className="button wizard-submit" type="submit" disabled={busy}>
            {busy ? "Registrerer…" : "Få partnerkode"}
          </button>
        </form>
      </div>
    </div>
  );
}
