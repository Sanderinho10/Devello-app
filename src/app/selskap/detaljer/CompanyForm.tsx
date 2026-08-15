"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatOrgNr } from "@/lib/onboarding/orgnr";

export function CompanyForm({
  company,
  isAdmin,
}: {
  company: {
    name: string;
    org_nr: string;
    billing_address_line: string;
    billing_postal_code: string;
    billing_city: string;
  };
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(company);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="stack">
      {error && <div className="banner error">{error}</div>}
      {saved && <div className="banner success">Lagret.</div>}
      {!isAdmin && (
        <div className="banner info">
          Bare administratorer kan endre selskapsopplysningene.
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <strong>Firma</strong>
        </div>
        <div className="card-pad">
          <div className="grid-2">
            <label className="field">
              <span className="label">Navn</span>
              <input
                className="input"
                required
                disabled={!isAdmin}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Organisasjonsnummer</span>
              <input
                className="input"
                inputMode="numeric"
                disabled={!isAdmin}
                value={form.org_nr}
                onChange={(e) => set("org_nr", e.target.value)}
                onBlur={(e) => set("org_nr", formatOrgNr(e.target.value))}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <strong>Fakturaadresse</strong>
            <div className="tiny muted">Hit sender vi fakturaen for Devello.</div>
          </div>
        </div>
        <div className="card-pad">
          <label className="field">
            <span className="label">Adresse</span>
            <input
              className="input"
              disabled={!isAdmin}
              value={form.billing_address_line}
              onChange={(e) => set("billing_address_line", e.target.value)}
            />
          </label>
          <div className="grid-2">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">Postnummer</span>
              <input
                className="input"
                inputMode="numeric"
                disabled={!isAdmin}
                value={form.billing_postal_code}
                onChange={(e) => set("billing_postal_code", e.target.value)}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">Poststed</span>
              <input
                className="input"
                disabled={!isAdmin}
                value={form.billing_city}
                onChange={(e) => set("billing_city", e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="action-bar">
          <span className="spacer" />
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Lagrer…" : "Lagre"}
          </button>
        </div>
      )}
    </form>
  );
}
