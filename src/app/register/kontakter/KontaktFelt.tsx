"use client";

import { useState } from "react";
import type { Customer } from "@/lib/types";
import type { Kontaktflagg, Kundefelt } from "@/lib/kunder/felt";

export type KontaktVerdier = Record<Kundefelt, string> & Record<Kontaktflagg, boolean>;

export const tomKontakt: KontaktVerdier = {
  name: "",
  contact: "",
  email: "",
  phone: "",
  website: "",
  org_nr: "",
  notes: "",
  address: "",
  address2: "",
  postal_code: "",
  city: "",
  country: "Norge",
  invoice_address: "",
  invoice_address2: "",
  invoice_postal_code: "",
  invoice_city: "",
  invoice_country: "",
  site_address: "",
  site_address2: "",
  site_postal_code: "",
  site_city: "",
  is_customer: true,
  is_supplier: false,
  is_person: false,
  invoice_separate: false,
  site_separate: false,
};

export function tilVerdier(k: Customer): KontaktVerdier {
  const ut = { ...tomKontakt };
  for (const navn of Object.keys(tomKontakt) as (keyof KontaktVerdier)[]) {
    const verdi = k[navn as keyof Customer];
    if (typeof tomKontakt[navn] === "boolean") (ut as Record<string, unknown>)[navn] = Boolean(verdi);
    else (ut as Record<string, unknown>)[navn] = typeof verdi === "string" ? verdi : "";
  }
  ut.country = k.country || "Norge";
  return ut;
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

/** Det som må være på plass før kontakten kan lagres, eller null når alt er i orden. */
export function manglar(v: KontaktVerdier): string | null {
  if (!v.name.trim()) return "Kontakten må ha et navn.";
  if (!harType(v)) return "Kryss av for kunde, leverandør eller begge.";
  return null;
}

type Fane = "kontakt" | "adresser" | "notater";

const FANER: { id: Fane; etikett: string }[] = [
  { id: "kontakt", etikett: "Kontakt" },
  { id: "adresser", etikett: "Adresser" },
  { id: "notater", etikett: "Notater" },
];

const LAND = ["Norge", "Sverige", "Danmark", "Finland", "Island", "Tyskland", "Polen", "Litauen", "Storbritannia"];

/**
 * Kontaktkortet, satt opp som i PowerOffice Go: faner til venstre, felt til
 * høyre. Samme skjema i «Ny kontakt» og på kontaktsiden.
 *
 * Kontakt-fanen har det man trenger hver gang, med hovedadressen. Under
 * Adresser ligger fakturaadresse og oppdragsadresse; de kan bare skrives i
 * når de er krysset av som egne, og viser ellers hovedadressen — det er den
 * som gjelder da.
 */
export function KontaktFelt({
  verdier,
  onChange,
  autoFocus,
  fane: styrtFane,
  onFane,
}: {
  verdier: KontaktVerdier;
  onChange: (v: KontaktVerdier) => void;
  autoFocus?: boolean;
  /** Settes av forelderen når en feil skal vises på riktig fane. */
  fane?: Fane;
  onFane?: (fane: Fane) => void;
}) {
  const [egenFane, setEgenFane] = useState<Fane>("kontakt");
  const fane = styrtFane ?? egenFane;
  const velgFane = onFane ?? setEgenFane;

  const sett = <K extends keyof KontaktVerdier>(navn: K, verdi: KontaktVerdier[K]) =>
    onChange({ ...verdier, [navn]: verdi });

  const tekst = (navn: Kundefelt, etikett: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="kontakt-rad">
      <span className="kontakt-rad-etikett">{etikett}</span>
      <input
        className="input"
        value={verdier[navn]}
        onChange={(e) => sett(navn, e.target.value)}
        {...props}
      />
    </label>
  );

  const notatAntall = verdier.notes.trim() ? 1 : 0;

  return (
    <div className="kontakt-skjema">
      <nav className="kontakt-faner" aria-label="Kontaktkort">
        {FANER.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`kontakt-fane${f.id === fane ? " aktiv" : ""}`}
            aria-current={f.id === fane ? "page" : undefined}
            onClick={() => velgFane(f.id)}
          >
            {f.etikett}
            {f.id === "notater" && notatAntall > 0 && <span className="kontakt-fane-tal">{notatAntall}</span>}
          </button>
        ))}
      </nav>

      <div className="kontakt-panel">
        {fane === "kontakt" && (
          <>
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett" />
              <div className="kontakt-valg" role="radiogroup" aria-label="Firma eller person">
                <label className="kontakt-type-valg">
                  <input
                    type="radio"
                    name="kontakt-person"
                    checked={!verdier.is_person}
                    onChange={() => sett("is_person", false)}
                  />
                  Firma
                </label>
                <label className="kontakt-type-valg">
                  <input
                    type="radio"
                    name="kontakt-person"
                    checked={verdier.is_person}
                    onChange={() => sett("is_person", true)}
                  />
                  Person
                </label>
              </div>
            </div>
            {tekst("name", "Navn", { autoFocus, "aria-required": true })}
            {!verdier.is_person && tekst("contact", "Kontaktperson")}
            {tekst("phone", "Telefon", { type: "tel" })}
            {tekst("email", "E-post", { type: "email" })}
            {tekst("website", "Nettside", { placeholder: "www.firma.no" })}
            {!verdier.is_person && tekst("org_nr", "Organisasjonsnr.", { inputMode: "numeric" })}

            <div className="kontakt-skilje">Hovedadresse</div>
            <AdresseFelt
              verdier={{
                linje1: verdier.address,
                linje2: verdier.address2,
                postnr: verdier.postal_code,
                sted: verdier.city,
                land: verdier.country,
              }}
              onChange={(a) =>
                onChange({
                  ...verdier,
                  address: a.linje1,
                  address2: a.linje2,
                  postal_code: a.postnr,
                  city: a.sted,
                  country: a.land ?? verdier.country,
                })
              }
              medLand
            />

            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Kontakten er en</span>
              <div className="kontakt-valg">
                <label className="kontakt-type-valg">
                  <input
                    type="checkbox"
                    checked={verdier.is_customer}
                    onChange={(e) => sett("is_customer", e.target.checked)}
                  />
                  Kunde
                </label>
                <label className="kontakt-type-valg">
                  <input
                    type="checkbox"
                    checked={verdier.is_supplier}
                    onChange={(e) => sett("is_supplier", e.target.checked)}
                  />
                  Leverandør
                </label>
                {!harType(verdier) && <span className="paakravd">Velg minst én</span>}
              </div>
            </div>
          </>
        )}

        {fane === "adresser" && (
          <>
            <EgenAdresse
              tittel="Fakturaadresse"
              avkryssing="Egen fakturaadresse"
              forklaring="Der fakturaen skal sendes, om det er et annet sted enn hovedadressen."
              egen={verdier.invoice_separate}
              verdier={
                verdier.invoice_separate
                  ? {
                      linje1: verdier.invoice_address,
                      linje2: verdier.invoice_address2,
                      postnr: verdier.invoice_postal_code,
                      sted: verdier.invoice_city,
                      land: verdier.invoice_country || verdier.country,
                    }
                  : hoved(verdier)
              }
              medLand
              onEgen={(egen) =>
                onChange({
                  ...verdier,
                  invoice_separate: egen,
                  // Første gang: start med hovedadressen, så holder det å rette det som er annerledes.
                  ...(egen && !verdier.invoice_address && !verdier.invoice_city
                    ? {
                        invoice_address: verdier.address,
                        invoice_address2: verdier.address2,
                        invoice_postal_code: verdier.postal_code,
                        invoice_city: verdier.city,
                        invoice_country: verdier.country,
                      }
                    : {}),
                })
              }
              onChange={(a) =>
                onChange({
                  ...verdier,
                  invoice_address: a.linje1,
                  invoice_address2: a.linje2,
                  invoice_postal_code: a.postnr,
                  invoice_city: a.sted,
                  invoice_country: a.land ?? verdier.invoice_country,
                })
              }
            />
            <EgenAdresse
              tittel="Oppdragsadresse"
              avkryssing="Egen oppdragsadresse"
              forklaring="Der jobben vanligvis gjøres — hytta, utleieboligen. Foreslås på nye ordrer for kontakten."
              egen={verdier.site_separate}
              verdier={
                verdier.site_separate
                  ? {
                      linje1: verdier.site_address,
                      linje2: verdier.site_address2,
                      postnr: verdier.site_postal_code,
                      sted: verdier.site_city,
                    }
                  : hoved(verdier)
              }
              onEgen={(egen) =>
                onChange({
                  ...verdier,
                  site_separate: egen,
                  ...(egen && !verdier.site_address && !verdier.site_city
                    ? {
                        site_address: verdier.address,
                        site_address2: verdier.address2,
                        site_postal_code: verdier.postal_code,
                        site_city: verdier.city,
                      }
                    : {}),
                })
              }
              onChange={(a) =>
                onChange({
                  ...verdier,
                  site_address: a.linje1,
                  site_address2: a.linje2,
                  site_postal_code: a.postnr,
                  site_city: a.sted,
                })
              }
            />
          </>
        )}

        {fane === "notater" && (
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="label">Notater</span>
            <textarea
              className="input"
              rows={8}
              value={verdier.notes}
              onChange={(e) => sett("notes", e.target.value)}
              placeholder="Portkode, faste ønsker, hvem som bestiller, kundenummer hos leverandøren …"
            />
          </label>
        )}
      </div>
    </div>
  );
}

interface AdresseVerdier {
  linje1: string;
  linje2: string;
  postnr: string;
  sted: string;
  land?: string;
}

function hoved(v: KontaktVerdier): AdresseVerdier {
  return { linje1: v.address, linje2: v.address2, postnr: v.postal_code, sted: v.city, land: v.country };
}

/** Adresse, linje 2, postnr./sted og land — som i Go. */
function AdresseFelt({
  verdier,
  onChange,
  medLand,
  disabled,
}: {
  verdier: AdresseVerdier;
  onChange: (a: AdresseVerdier) => void;
  medLand?: boolean;
  disabled?: boolean;
}) {
  const sett = (navn: keyof AdresseVerdier, verdi: string) => onChange({ ...verdier, [navn]: verdi });
  return (
    <>
      <label className="kontakt-rad">
        <span className="kontakt-rad-etikett">Adresse</span>
        <input
          className="input"
          value={verdier.linje1}
          disabled={disabled}
          autoComplete="address-line1"
          onChange={(e) => sett("linje1", e.target.value)}
        />
      </label>
      <label className="kontakt-rad">
        <span className="kontakt-rad-etikett" />
        <input
          className="input"
          value={verdier.linje2}
          disabled={disabled}
          aria-label="Adresselinje 2"
          autoComplete="address-line2"
          onChange={(e) => sett("linje2", e.target.value)}
        />
      </label>
      <div className="kontakt-rad">
        <span className="kontakt-rad-etikett">Postnr./sted</span>
        <div className="kontakt-poststed">
          <input
            className="input"
            value={verdier.postnr}
            disabled={disabled}
            inputMode="numeric"
            aria-label="Postnummer"
            autoComplete="postal-code"
            onChange={(e) => sett("postnr", e.target.value)}
          />
          <input
            className="input"
            value={verdier.sted}
            disabled={disabled}
            aria-label="Poststed"
            autoComplete="address-level2"
            onChange={(e) => sett("sted", e.target.value)}
          />
        </div>
      </div>
      {medLand && (
        <label className="kontakt-rad">
          <span className="kontakt-rad-etikett">Land</span>
          <input
            className="input"
            list="kontakt-land"
            value={verdier.land ?? ""}
            disabled={disabled}
            autoComplete="country-name"
            onChange={(e) => sett("land", e.target.value)}
          />
          <datalist id="kontakt-land">
            {LAND.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      )}
    </>
  );
}

/** En adresse som er lik hovedadressen til den krysses av som egen. */
function EgenAdresse({
  tittel,
  avkryssing,
  forklaring,
  egen,
  verdier,
  onEgen,
  onChange,
  medLand,
}: {
  tittel: string;
  avkryssing: string;
  forklaring: string;
  egen: boolean;
  verdier: AdresseVerdier;
  onEgen: (egen: boolean) => void;
  onChange: (a: AdresseVerdier) => void;
  medLand?: boolean;
}) {
  return (
    <section className="kontakt-adresse">
      <div className="kontakt-adresse-hode">
        <h3>{tittel}</h3>
        <label className="kontakt-type-valg">
          <input type="checkbox" checked={egen} onChange={(e) => onEgen(e.target.checked)} />
          {avkryssing}
        </label>
      </div>
      <p className="muted kontakt-adresse-forklaring">
        {egen ? forklaring : "Samme som hovedadressen. Kryss av for å skrive inn en annen."}
      </p>
      <AdresseFelt verdier={verdier} onChange={onChange} medLand={medLand} disabled={!egen} />
    </section>
  );
}
