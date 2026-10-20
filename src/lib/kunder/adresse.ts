import type { Customer } from "@/lib/types";

/**
 * Adressene på en kontakt.
 *
 * Hovedadressen står alltid. Fakturaadressen gjelder bare når den er
 * krysset av som egen; ellers er den lik hovedadressen. Alle som trenger
 * «adressen vi fakturerer til» skal gå via funksjonene her, så regelen bor
 * ett sted. Hvor en jobb gjøres står på ordren (site_address), ikke på
 * kunden — de gamle site_*-kolonnene på kunden leses ikke lenger.
 */
export interface Adresse {
  linje1: string;
  linje2: string;
  postnr: string;
  sted: string;
  land: string;
}

type AdresseFelt = Pick<
  Customer,
  | "address"
  | "address2"
  | "postal_code"
  | "city"
  | "country"
  | "invoice_separate"
  | "invoice_address"
  | "invoice_address2"
  | "invoice_postal_code"
  | "invoice_city"
  | "invoice_country"
>;

export function hovedadresse(k: Partial<AdresseFelt>): Adresse {
  return {
    linje1: k.address ?? "",
    linje2: k.address2 ?? "",
    postnr: k.postal_code ?? "",
    sted: k.city ?? "",
    land: k.country || "Norge",
  };
}

export function fakturaadresse(k: Partial<AdresseFelt>): Adresse {
  if (!k.invoice_separate) return hovedadresse(k);
  return {
    linje1: k.invoice_address ?? "",
    linje2: k.invoice_address2 ?? "",
    postnr: k.invoice_postal_code ?? "",
    sted: k.invoice_city ?? "",
    land: k.invoice_country || k.country || "Norge",
  };
}

/** «Storgata 1, 5003 Bergen». Landet tas bare med når det ikke er Norge. */
export function adresseTekst(a: Adresse): string {
  const poststed = [a.postnr, a.sted].map((s) => s.trim()).filter(Boolean).join(" ");
  const land = a.land.trim() && a.land.trim().toLowerCase() !== "norge" ? a.land.trim() : "";
  return [a.linje1, a.linje2, poststed, land].map((s) => s.trim()).filter(Boolean).join(", ");
}
