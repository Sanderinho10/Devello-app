"use client";

import type { Customer } from "@/lib/types";

export type KundeVerdier = Record<
  "name" | "contact" | "email" | "phone" | "address" | "org_nr" | "notes",
  string
>;

export const tomKunde: KundeVerdier = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  org_nr: "",
  notes: "",
};

export function tilVerdier(k: Customer): KundeVerdier {
  return {
    name: k.name,
    contact: k.contact ?? "",
    email: k.email ?? "",
    phone: k.phone ?? "",
    address: k.address ?? "",
    org_nr: k.org_nr ?? "",
    notes: k.notes ?? "",
  };
}

const FELT: { navn: keyof KundeVerdier; etikett: string; type?: string; bred?: boolean }[] = [
  { navn: "name", etikett: "Navn" },
  { navn: "contact", etikett: "Kontaktperson" },
  { navn: "email", etikett: "E-post", type: "email" },
  { navn: "phone", etikett: "Telefon" },
  { navn: "address", etikett: "Adresse", bred: true },
  { navn: "org_nr", etikett: "Organisasjonsnummer" },
];

/** Feltene på kundekortet — samme sett i «Ny kunde» og på kundesiden. */
export function KundeFelt({
  verdier,
  onChange,
  autoFocus,
}: {
  verdier: KundeVerdier;
  onChange: (v: KundeVerdier) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
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
          placeholder="Portkode, faste ønsker, hvem som bestiller …"
        />
      </label>
    </>
  );
}
