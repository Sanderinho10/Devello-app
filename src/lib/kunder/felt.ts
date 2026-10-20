/** Tekstfeltene brukeren kan skrive i. Resten (id, selskap, tidspunkt) setter vi. */
export const KUNDEFELT = [
  "name",
  "contact",
  "email",
  "phone",
  "website",
  "org_nr",
  "notes",
  "address",
  "address2",
  "postal_code",
  "city",
  "country",
  "invoice_address",
  "invoice_address2",
  "invoice_postal_code",
  "invoice_city",
  "invoice_country",
  "site_address",
  "site_address2",
  "site_postal_code",
  "site_city",
] as const;
export type Kundefelt = (typeof KUNDEFELT)[number];

/** Av/på-feltene: kunde/leverandør, firma/person og om adressene er egne. */
export const KONTAKTFLAGG = ["is_customer", "is_supplier", "is_person", "invoice_separate", "site_separate"] as const;
export type Kontaktflagg = (typeof KONTAKTFLAGG)[number];

/** Felt som kommer tilbake til null når adressen ikke lenger er egen. */
const FAKTURAFELT = ["invoice_address", "invoice_address2", "invoice_postal_code", "invoice_city", "invoice_country"] as const;
const OPPDRAGSFELT = ["site_address", "site_address2", "site_postal_code", "site_city"] as const;

/**
 * Plukker ut og trimmer feltene som er sendt inn. Felt som ikke er med i
 * kroppen blir ikke med i resultatet, så PATCH kan sende bare det som er
 * endret. Tomme strenger blir null — bortsett fra navnet, som aldri er null,
 * og landet, som er Norge når det står tomt.
 */
export function lesKundefelt(
  body: Record<string, unknown>,
  felt: readonly Kundefelt[],
): Partial<Record<Kundefelt, string | null>> & { name?: string } {
  const ut: Partial<Record<Kundefelt, string | null>> = {};
  for (const navn of felt) {
    if (body[navn] === undefined) continue;
    const verdi = typeof body[navn] === "string" ? (body[navn] as string).trim() : "";
    if (navn === "name") ut[navn] = verdi;
    else if (navn === "country") ut[navn] = verdi || "Norge";
    else ut[navn] = verdi || null;
  }
  return ut as Partial<Record<Kundefelt, string | null>> & { name?: string };
}

/** Plukker ut av/på-feltene som er sendt inn. Bare ekte booleans tas med. */
export function lesKontaktflagg(body: Record<string, unknown>): Partial<Record<Kontaktflagg, boolean>> {
  const ut: Partial<Record<Kontaktflagg, boolean>> = {};
  for (const navn of KONTAKTFLAGG) {
    if (typeof body[navn] === "boolean") ut[navn] = body[navn] as boolean;
  }
  return ut;
}

/**
 * Alt som skal lagres fra et skjema: tekstfeltene og flaggene. Krysses en
 * egen adresse av, tømmes feltene dens — ellers ville en gammel adresse
 * ligge og vente på neste gang noen krysser på igjen.
 */
export function lesKontakt(body: Record<string, unknown>) {
  const ut: Record<string, string | boolean | null> = {
    ...lesKundefelt(body, KUNDEFELT),
    ...lesKontaktflagg(body),
  };
  if (ut.invoice_separate === false) for (const f of FAKTURAFELT) ut[f] = null;
  if (ut.site_separate === false) for (const f of OPPDRAGSFELT) ut[f] = null;
  return ut as Partial<Record<Kundefelt, string | null>> &
    Partial<Record<Kontaktflagg, boolean>> & { name?: string };
}

/** Filteret i kontaktlisten, fra ?type= i adressen. */
export type KontaktFilter = "alle" | "kunder" | "leverandorer";

export function lesKontaktFilter(verdi: string | undefined): KontaktFilter {
  return verdi === "kunder" || verdi === "leverandorer" ? verdi : "alle";
}

/**
 * Kort merkelapp for listene: «Kunde», «Leverandør» eller «Kunde og
 * leverandør». Ligger her og ikke i KontaktFelt.tsx: den er "use client", og
 * serversidene kan ikke kalle funksjoner derfra.
 */
export function kontakttypeTekst(k: { is_customer: boolean; is_supplier: boolean }): string {
  if (k.is_customer && k.is_supplier) return "Kunde og leverandør";
  return k.is_supplier ? "Leverandør" : "Kunde";
}
