"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyBrand, ToneSettings } from "@/lib/types";

/**
 * Innstillinger som hører til tilbudsagenten: merkevaren på PDF-en og tonen i
 * e-posten. Selskapsnavn og organisasjonsnummer ligger under Selskap —
 * de hører ikke til én agent, og to skjemaer som eier samme felt vil før eller
 * siden overskrive hverandre.
 */
export function SettingsForm({
  company,
  brand,
}: {
  company: { tone_settings: ToneSettings };
  brand: Partial<CompanyBrand> | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    formalitet: company.tone_settings.formalitet ?? "du",
    signatur: company.tone_settings.signatur ?? "",
    tillegg: company.tone_settings.tillegg ?? "",
    logo_url: brand?.logo_url ?? "",
    primary_color: brand?.primary_color ?? "#1d1d1f",
    contact_name: brand?.contact_name ?? "",
    contact_email: brand?.contact_email ?? "",
    contact_phone: brand?.contact_phone ?? "",
    address_line: brand?.address_line ?? "",
    postal_code: brand?.postal_code ?? "",
    city: brand?.city ?? "",
    website: brand?.website ?? "",
    footer_note: brand?.footer_note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
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

      {/* Merkevare — dette blir injisert i Devellos PDF-mal */}
      <div className="card">
        <div className="card-header">
          <div>
            <strong>Merkevare</strong>
            <div className="tiny muted">
              Logo, farge og kontaktinfo blir lagt inn i Devellos PDF-mal.
            </div>
          </div>
        </div>
        <div className="card-pad">
          <div className="grid-2">
            <label className="field">
              <span className="label">Logo-URL</span>
              <input
                className="input"
                value={form.logo_url}
                onChange={(e) => set("logo_url", e.target.value)}
                placeholder="https://…/logo.png"
              />
            </label>
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

          <label className="field">
            <span className="label">Adresse</span>
            <input
              className="input"
              value={form.address_line}
              onChange={(e) => set("address_line", e.target.value)}
            />
          </label>

          <div className="grid-2">
            <label className="field">
              <span className="label">Postnummer</span>
              <input
                className="input"
                value={form.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Poststed</span>
              <input
                className="input"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </label>
          </div>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Bunntekst i PDF</span>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              value={form.footer_note}
              onChange={(e) => set("footer_note", e.target.value)}
              placeholder="Org.nr 999 999 999 MVA · Kontonr 1234.56.78901"
            />
          </label>
        </div>
      </div>

      {/* Tone — styrer hvordan agenten formulerer e-postteksten */}
      <div className="card">
        <div className="card-header">
          <div>
            <strong>Tone</strong>
            <div className="tiny muted">
              Styrer hvordan agenten formulerer e-postteksten.
            </div>
          </div>
        </div>
        <div className="card-pad">
          <label className="field">
            <span className="label">Tiltaleform</span>
            <select
              className="select"
              value={form.formalitet}
              onChange={(e) => set("formalitet", e.target.value)}
            >
              <option value="du">Du</option>
              <option value="de">De</option>
            </select>
          </label>

          <label className="field">
            <span className="label">Signatur</span>
            <textarea
              className="textarea"
              style={{ minHeight: 80 }}
              value={form.signatur}
              onChange={(e) => set("signatur", e.target.value)}
              placeholder={"Med vennlig hilsen\nOle Nordmann\nStar Elektro AS"}
            />
          </label>

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Tilleggsinstruks (valgfritt)</span>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              value={form.tillegg}
              onChange={(e) => set("tillegg", e.target.value)}
              placeholder="F.eks. «Nevn alltid at vi er sertifiserte for anlegg over 400 V.»"
            />
          </label>
        </div>
      </div>

      <div className="action-bar">
        <span className="spacer" />
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Lagrer…" : "Lagre"}
        </button>
      </div>
    </form>
  );
}
