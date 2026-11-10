"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandImageUpload } from "@/components/BrandImageUpload";
import { MOTOR_LABELS, MOTOR_VERSJONER, type MotorVersjon } from "@/lib/claude/motor-versjon";
import type { CompanyBrand, ToneSettings } from "@/lib/types";
import { Lagrelinje, Panel, Rad } from "./Panel";

/**
 * Innstillingene som hører til tilbudsagenten alene.
 *
 * Logo, farge, kontaktinfo, adresse og målform gjelder hele selskapet og
 * står under Firma og profil. To felt for samme opplysning spriker før eller
 * siden, og da vet ingen hvilket av dem kunden faktisk ser. Her står det som
 * former tilbudet. Alt lagres samlet til /api/settings.
 */
export function SettingsForm({
  company,
  brand,
  standardMotor,
}: {
  company: { tone_settings: ToneSettings; motor_versjon: MotorVersjon | null };
  brand: Partial<CompanyBrand> | null;
  /** Motoren som gjelder når selskapet ikke har valgt selv. */
  standardMotor: MotorVersjon;
}) {
  const router = useRouter();
  const start = {
    signatur: company.tone_settings.signatur ?? "",
    tillegg: company.tone_settings.tillegg ?? "",
    footer_note: brand?.footer_note ?? "",
    // Tom streng = følg standarden. Lagres som null.
    motor_versjon: company.motor_versjon ?? "",
  };
  const [form, setForm] = useState(start);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endret = JSON.stringify(form) !== JSON.stringify(start);

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

      <Panel tittel="E-post og PDF" hint="Signaturen i e-posten agenten skriver, og bunnteksten i tilbuds-PDF-en.">
        <Rad etikett="Signatur" topp hint="Avslutningen på e-postene agenten skriver.">
          <textarea className="textarea" style={{ minHeight: 80 }} value={form.signatur} onChange={(e) => set("signatur", e.target.value)} />
        </Rad>
        <Rad etikett="Bilde i signaturen" topp som="div">
          <BrandImageUpload
            type="signatur"
            label="Bilde i signaturen"
            utenEtikett
            harBilde={Boolean(brand?.signature_image_path)}
            hoyde={54}
            hint="Valgfritt. Ligger logoen i Outlook-signaturen, kopier den og lim den inn her. Bildet legges nederst i e-posten og følger med som en del av den — ikke som en lenke. Lagres med én gang."
          />
        </Rad>
        <Rad etikett="Bunntekst i PDF" topp hint="Står nederst på hver side i tilbuds-PDF-en.">
          <textarea
            className="textarea"
            style={{ minHeight: 64 }}
            value={form.footer_note}
            onChange={(e) => set("footer_note", e.target.value)}
            placeholder="Org.nr 999 999 999 MVA · Kontonr 1234.56.78901"
          />
        </Rad>
      </Panel>

      <Panel tittel="Tilleggsinstruks" hint="Går rett inn i agentens kontekst, ordrett, på hvert eneste tilbud.">
        <Rad etikett="Instruks" topp hint="Skriv det slik du ville sagt det til en ny medarbeider.">
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            value={form.tillegg}
            onChange={(e) => set("tillegg", e.target.value)}
            placeholder="F.eks. «Nevn alltid at vi er sertifiserte for anlegg over 400 V.»"
          />
        </Rad>
      </Panel>

      <Panel tittel="Motor" hint="Hvilken versjon av agenten som lager utkastene. Neste utkast bruker den du velger; laget utkast endres ikke.">
        <Rad
          etikett="Versjon"
          hint="v3 lister først opp alt arbeid jobben består av, stiller inntil tre spørsmål til kunden i e-posten, og stopper utkast som er urimelig små for jobbtypen. v2 er motoren slik den var før."
        >
          <select className="input" style={{ maxWidth: 320 }} value={form.motor_versjon} onChange={(e) => set("motor_versjon", e.target.value)}>
            <option value="">Standard ({MOTOR_LABELS[standardMotor]})</option>
            {MOTOR_VERSJONER.map((v) => (
              <option key={v} value={v}>
                {MOTOR_LABELS[v]}
              </option>
            ))}
          </select>
        </Rad>
      </Panel>

      <Lagrelinje flytende endret={endret} busy={busy} lagret={saved} onAngre={() => setForm(start)} />
    </form>
  );
}
