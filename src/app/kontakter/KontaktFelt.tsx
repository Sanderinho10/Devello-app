"use client";

import type { Customer } from "@/lib/types";

type Tekstfelt = "name" | "contact" | "email" | "phone" | "address" | "org_nr" | "notes";

export type KontaktVerdier = Record<Tekstfelt, string> & {
  is_customer: boolean;
  is_supplier: boolean;
};

export const tomKontakt: KontaktVerdier = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  org_nr: "",
  notes: "",
  is_customer: true,
  is_supplier: false,
};

export function tilVerdier(k: Customer): KontaktVerdier {
  return {
    name: k.name,
    contact: k.contact ?? "",
    email: k.email ?? "",
    phone: k.phone ?? "",
    address: k.address ?? "",
    org_nr: k.org_nr ?? "",
    notes: k.notes ?? "",
    is_customer: k.is_customer,
    is_supplier: k.is_supplier,
  };
}

/** Er noe endret siden sist lagring? Tekst sammenlignes uten mellomrom i endene. */
export function erEndret(a: KontaktVerdier, b: KontaktVerdier): boolean {
  return (Object.keys(a) as (keyof KontaktVerdier)[]).some((k) => {
    const x = a[k];
    const y = b[k];
    return typeof x === "string" && typeof y === "string" ? x.trim() !== y.trim() : x !== y;
  });
}

/** Kunde, leverandør eller begge. Minst én må være på. */
export function harType(v: KontaktVerdier): boolean {
  return v.is_customer || v.is_supplier;
}

const FELT: { navn: Tekstfelt; etikett: string; type?: string; bred?: boolean }[] = [
  { navn: "name", etikett: "Navn" },
  { navn: "contact", etikett: "Kontaktperson" },
  { navn: "email", etikett: "E-post", type: "email" },
  { navn: "phone", etikett: "Telefon" },
  { navn: "address", etikett: "Adresse", bred: true },
  { navn: "org_nr", etikett: "Organisasjonsnummer" },
];

/** Feltene på kontaktkortet — samme sett i «Ny kontakt» og på kontaktsiden. */
export function KontaktFelt({
  verdier,
  onChange,
  autoFocus,
}: {
  verdier: KontaktVerdier;
  onChange: (v: KontaktVerdier) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <div className="kontakt-type" role="group" aria-label="Kontakten er en">
        <span className="kontakt-type-etikett">Kontakten er en</span>
        <label className="kontakt-type-valg">
          <input
            type="checkbox"
            checked={verdier.is_customer}
            onChange={(e) => onChange({ ...verdier, is_customer: e.target.checked })}
          />
          Kunde
        </label>
        <label className="kontakt-type-valg">
          <input
            type="checkbox"
            checked={verdier.is_supplier}
            onChange={(e) => onChange({ ...verdier, is_supplier: e.target.checked })}
          />
          Leverandør
        </label>
        {!harType(verdier) && <span className="paakravd">Velg minst én</span>}
      </div>
      <div className="grid-2">
        {FELT.map((f) => (
          <label
            key={f.navn}
            className="field"
            style={f.bred ? { gridColumn: "1 / -1" } : undefined}
          >
            <span className="label">{f.etikett}</span>
            <input
              className="input"
              type={f.type ?? "text"}
              required={f.navn === "name"}
              autoFocus={autoFocus && f.navn === "name"}
              value={verdier[f.navn]}
              onChange={(e) => onChange({ ...verdier, [f.navn]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="field" style={{ marginBottom: 0 }}>
        <span className="label">Notater</span>
        <textarea
          className="input"
          rows={3}
          value={verdier.notes}
          onChange={(e) => onChange({ ...verdier, notes: e.target.value })}
          placeholder="Portkode, faste ønsker, hvem som bestiller, kundenummer hos leverandøren …"
        />
      </label>
    </>
  );
}

/** Kort merkelapp for listene: «Kunde», «Leverandør» eller «Kunde og leverandør». */
export function kontakttypeTekst(k: { is_customer: boolean; is_supplier: boolean }): string {
  if (k.is_customer && k.is_supplier) return "Kunde og leverandør";
  return k.is_supplier ? "Leverandør" : "Kunde";
}
