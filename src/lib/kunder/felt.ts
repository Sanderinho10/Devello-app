/** Feltene brukeren kan skrive i. Resten (id, selskap, tidspunkt) setter vi. */
export const KUNDEFELT = ["name", "contact", "email", "phone", "address", "org_nr", "notes"] as const;
export type Kundefelt = (typeof KUNDEFELT)[number];

/**
 * Plukker ut og trimmer feltene som er sendt inn. Felt som ikke er med i
 * kroppen blir ikke med i resultatet, så PATCH kan sende bare det som er
 * endret. Tomme strenger blir null — bortsett fra navnet, som aldri er null.
 */
export function lesKundefelt(
  body: Record<string, unknown>,
  felt: readonly Kundefelt[],
): Partial<Record<Kundefelt, string | null>> & { name?: string } {
  const ut: Partial<Record<Kundefelt, string | null>> = {};
  for (const navn of felt) {
    if (body[navn] === undefined) continue;
    const verdi = typeof body[navn] === "string" ? (body[navn] as string).trim() : "";
    ut[navn] = navn === "name" ? verdi : verdi || null;
  }
  return ut as Partial<Record<Kundefelt, string | null>> & { name?: string };
}

/** Hva kontakten er: kunde, leverandør eller begge. */
export type Kontakttype = { is_customer?: boolean; is_supplier?: boolean };

/** Plukker ut avkryssingene som er sendt inn. Bare ekte booleans tas med. */
export function lesKontakttype(body: Record<string, unknown>): Kontakttype {
  const ut: Kontakttype = {};
  if (typeof body.is_customer === "boolean") ut.is_customer = body.is_customer;
  if (typeof body.is_supplier === "boolean") ut.is_supplier = body.is_supplier;
  return ut;
}

/** Filteret i kontaktlisten, fra ?type= i adressen. */
export type KontaktFilter = "alle" | "kunder" | "leverandorer";

export function lesKontaktFilter(verdi: string | undefined): KontaktFilter {
  return verdi === "kunder" || verdi === "leverandorer" ? verdi : "alle";
}
