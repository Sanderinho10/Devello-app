"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandImageUpload } from "@/components/BrandImageUpload";
import { normalizeOrgNr } from "@/lib/onboarding/orgnr";
import { Lagrelinje, Panel, Rad } from "./Panel";

export type CompanyFormData = {
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

/**
 * Alt som gjelder hele selskapet: firmaopplysninger, adresse, profilen som
 * havner på tilbudene, og målformen agentene skriver på.
 *
 * Merkevaren er selskapets, ikke ett produkts: neste agent skal bruke den
 * samme uten at noen må fylle den ut på nytt. Alt lagres samlet til
 * /api/company, så skjemaet er ett selv om det står i to paneler.
 */
export function CompanyForm({
  company,
  isAdmin,
  harLogo,
}: {
  company: CompanyFormData;
  isAdmin: boolean;
  harLogo: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(company);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endret = JSON.stringify(form) !== JSON.stringify(company);

  function set(key: keyof CompanyFormData, value: string) {
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

  const felt = (key: keyof CompanyFormData, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="input" disabled={!isAdmin} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
  );

  return (
    <form onSubmit={save} className="stack">
      {error && <div className="banner error">{error}</div>}

      <Panel tittel="Firma" hint="Adressen er både fakturaadressen vår til dere og avsenderadressen øverst i tilbudene.">
        <Rad etikett="Navn">{felt("name", { required: true })}</Rad>
        <Rad etikett="Organisasjonsnummer" smal>
          <input
            className="input"
            inputMode="numeric"
            disabled={!isAdmin}
            value={form.org_nr}
            onChange={(e) => set("org_nr", normalizeOrgNr(e.target.value).slice(0, 9))}
          />
        </Rad>
        <Rad etikett="Adresse">{felt("billing_address_line")}</Rad>
        <Rad etikett="Postnr. og sted" som="div">
          <span className="inst-postnr">
            {felt("billing_postal_code", { inputMode: "numeric", "aria-label": "Postnummer", maxLength: 4 })}
            {felt("billing_city", { "aria-label": "Poststed" })}
          </span>
        </Rad>
      </Panel>

      <Panel tittel="Profil på tilbudene" hint="Logo, farge og kontaktinfo som legges inn i Devellos PDF-mal.">
        <Rad etikett="Logo" som="div" topp>
          <BrandImageUpload
            type="logo"
            label="Logo"
            utenEtikett
            harBilde={harLogo}
            kanEndre={isAdmin}
            hint="PNG, JPG, WEBP eller SVG, opptil 2 MB. Står best med gjennomsiktig bakgrunn. Uten logo bruker tilbudet firmanavnet i tekst. Lagres med én gang."
          />
        </Rad>
        <Rad etikett="Primærfarge" som="div">
          <span className="inst-farge">
            <input
              type="color"
              aria-label="Velg farge"
              disabled={!isAdmin}
              value={form.primary_color}
              onChange={(e) => set("primary_color", e.target.value)}
            />
            {felt("primary_color", { "aria-label": "Fargekode" })}
          </span>
        </Rad>
        <Rad etikett="Målform" smal hint="All tekst agentene skriver til kundene deres.">
          <select className="input" disabled={!isAdmin} value={form.maalform} onChange={(e) => set("maalform", e.target.value)}>
            <option value="nb">Bokmål</option>
            <option value="nn">Nynorsk</option>
          </select>
        </Rad>
        <Rad etikett="Kontaktperson">{felt("contact_name")}</Rad>
        <Rad etikett="E-post">{felt("contact_email", { type: "email" })}</Rad>
        <Rad etikett="Telefon" smal>
          {felt("contact_phone", { type: "tel" })}
        </Rad>
        <Rad etikett="Nettsted">{felt("website", { placeholder: "www.firma.no" })}</Rad>
      </Panel>

      <Lagrelinje
        flytende
        endret={endret}
        busy={busy}
        lagret={saved}
        onAngre={() => setForm(company)}
        kanEndre={isAdmin}
        ikkeAdmin="Bare administratorer kan endre selskapsopplysningene."
      />
    </form>
  );
}
