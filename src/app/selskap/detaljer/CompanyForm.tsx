"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { normalizeOrgNr } from "@/lib/onboarding/orgnr";
import { LogoUpload } from "@/components/LogoUpload";

/**
 * Alt som gjelder hele selskapet: firmaopplysninger, adresse, profilen som
 * havner på tilbudene, og målformen agentene skriver på.
 *
 * Merkevaren lå tidligere under tilbudsagenten. Den hører hjemme her: logoen
 * og fargen er selskapets, ikke ett produkts, og neste agent skal bruke den
 * samme uten at noen må fylle den ut på nytt.
 */
export function CompanyForm({
  company,
  isAdmin,
  harLogo,
}: {
  company: {
    name: string;
    org_nr: string;
    billing_address_line: string;
    billing_postal_code: string;
    billing_city: string;
    maalform: string;
    primary_color: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    website: string;
  };
  isAdmin: boolean;
  harLogo: boolean;
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
                onChange={(e) => set("org_nr", normalizeOrgNr(e.target.value).slice(0, 9))}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <strong>Adresse</strong>
            <div className="tiny muted">
              Både fakturaadressen vår til dere, og avsenderadressen øverst i
              tilbudene deres.
            </div>
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

      <div className="card">
        <div className="card-header">
          <div>
            <strong>Profil på tilbudene</strong>
            <div className="tiny muted">
              Logo, farge og kontaktinfo som blir lagt inn i Devellos PDF-mal.
            </div>
          </div>
        </div>
        <div className="card-pad">
          <LogoUpload harLogo={harLogo} kanEndre={isAdmin} />

          <div className="grid-2">
            <label className="field">
              <span className="label">Primærfarge</span>
              <div className="row">
                <input
                  type="color"
                  disabled={!isAdmin}
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
                  disabled={!isAdmin}
                  value={form.primary_color}
                  onChange={(e) => set("primary_color", e.target.value)}
                />
              </div>
            </label>
            <label className="field">
              <span className="label">Målform</span>
              <select
                className="select"
                disabled={!isAdmin}
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
                disabled={!isAdmin}
                value={form.contact_name}
                onChange={(e) => set("contact_name", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Kontakt-e-post</span>
              <input
                className="input"
                type="email"
                disabled={!isAdmin}
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
              />
            </label>
          </div>

          <div className="grid-2">
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">Telefon</span>
              <input
                className="input"
                disabled={!isAdmin}
                value={form.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
              />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="label">Nettsted</span>
              <input
                className="input"
                disabled={!isAdmin}
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
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
