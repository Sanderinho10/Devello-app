"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandImageUpload } from "@/components/BrandImageUpload";
import type { CompanyBrand, ToneSettings } from "@/lib/types";

/**
 * Innstillingene som hører til tilbudsagenten alene.
 *
 * Logo, farge, kontaktinfo, adresse og målform gjelder hele selskapet og
 * ligger under Selskap → Detaljer. De sto en stund begge steder, og det er
 * verre enn å ha dem ett vanskelig sted: to felt for samme opplysning spriker
 * før eller siden, og da vet ingen hvilket av dem kunden faktisk ser.
 *
 * Igjen står det som former dette ene tilbudet.
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
    signatur: company.tone_settings.signatur ?? "",
    tillegg: company.tone_settings.tillegg ?? "",
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

      <div className="card">
        <div className="card-header">
          <div>
            <strong>Tilbudet</strong>
            <div className="tiny muted">
              Signaturen i e-posten og bunnteksten i PDF-en.
            </div>
          </div>
        </div>
        <div className="card-pad">
          <label className="field">
            <span className="label">Signatur</span>
            <textarea
              className="textarea"
              style={{ minHeight: 80 }}
              value={form.signatur}
              onChange={(e) => set("signatur", e.target.value)}
            />
            <span className="hint">Avslutningen på e-postene agenten skriver.</span>
          </label>

          <BrandImageUpload
            type="signatur"
            label="Bilde i signaturen (valgfritt)"
            harBilde={Boolean(brand?.signature_image_path)}
            hoyde={54}
            hint="Ligger logoen din i Outlook-signaturen, kopier den og lim den inn her. Bildet legges nederst i e-posten, under signaturteksten, og følger med til kunden som en del av e-posten — ikke som en lenke."
          />

          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Bunntekst i PDF</span>
            <textarea
              className="textarea"
              style={{ minHeight: 70 }}
              value={form.footer_note}
              onChange={(e) => set("footer_note", e.target.value)}
              placeholder="Org.nr 999 999 999 MVA · Kontonr 1234.56.78901"
            />
            <span className="hint">Står nederst på hver side i tilbuds-PDF-en.</span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <strong>Tilleggsinstruks</strong>
            <div className="tiny muted">
              Går rett inn i agentens kontekst, ordrett.
            </div>
          </div>
        </div>
        <div className="card-pad">
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Tilleggsinstruks (valgfritt)</span>
            <textarea
              className="textarea"
              style={{ minHeight: 90 }}
              value={form.tillegg}
              onChange={(e) => set("tillegg", e.target.value)}
              placeholder="F.eks. «Nevn alltid at vi er sertifiserte for anlegg over 400 V.»"
            />
            <span className="hint">
              Skriv det slik du ville sagt det til en ny medarbeider. Alt du
              skriver her følger med på hvert eneste tilbud.
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-pad">
          <div className="tiny muted">
            Logo, farge, kontaktinfo, adresse og målform gjelder hele selskapet
            og ligger under{" "}
            <Link href="/selskap/detaljer" className="drop-link">
              Selskap → Detaljer
            </Link>
            .
          </div>
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
