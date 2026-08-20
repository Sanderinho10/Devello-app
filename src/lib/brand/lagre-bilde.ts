import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lagring av merkevarebildene — logoen og bildet i e-postsignaturen.
 *
 * Ligger her og ikke i ruta fordi to veier fører hit: innstillingssiden, der
 * brukeren er innlogget, og registreringen, der kontoen ennå ikke finnes. Den
 * siste er et åpent endepunkt, og det er det siste stedet man vil ha en egen
 * kopi av filvalideringen som kan drive fra originalen.
 */

export const BUCKET = "brand-logos";
export const MAKS_BYTES = 2 * 1024 * 1024;

/** Hvilken kolonne på company_brand bildet hører til. */
export const BILDEKOLONNE: Record<string, string> = {
  logo: "logo_path",
  signatur: "signature_image_path",
};

const FRA_ENDELSE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};

const TILLATT_MIME: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif": true,
  "image/svg+xml": true,
};

/** Feil brukeren har skyld i, og skal få se ordrett. Blir 400, ikke 500. */
export class UgyldigBilde extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UgyldigBilde";
  }
}

/**
 * Finner en trygg content-type, eller kaster.
 *
 * Et limt inn bilde fra utklippstavlen heter «image.png» eller ingenting, så
 * filendelsen alene holder ikke. Vi tar endelsen når den er kjent, og faller
 * tilbake på MIME-typen nettleseren oppga — men bare når den står på lista.
 */
export function contentTypeFor(filnavn: string, mimeType: string): string {
  const endelse = (filnavn.split(".").pop() ?? "").toLowerCase();
  const type = FRA_ENDELSE[endelse] ?? (mimeType in TILLATT_MIME ? mimeType : null);
  if (!type) {
    throw new UgyldigBilde("Bildet må være PNG, JPG, WEBP, GIF eller SVG.");
  }
  return type;
}

export function sjekkStoerrelse(bytes: number): void {
  if (bytes > MAKS_BYTES) {
    throw new UgyldigBilde("Bildet kan være opptil 2 MB. Skaler det ned først.");
  }
}

/**
 * Legger bildet i lagringen, peker company_brand på den nye stien og fjerner
 * den gamle fila.
 *
 * Rekkefølgen er med vilje: den gamle slettes først når den nye er trygt på
 * plass og raden peker på den. Feiler noe underveis, sitter kunden igjen med
 * logoen sin — ikke uten.
 */
export async function lagreMerkevarebilde(
  admin: SupabaseClient,
  input: {
    companyId: string;
    type: "logo" | "signatur";
    bytes: Buffer;
    filnavn: string;
    mimeType: string;
  },
): Promise<string> {
  const kolonne = BILDEKOLONNE[input.type];
  if (!kolonne) throw new UgyldigBilde("Ukjent bildetype.");

  const contentType = contentTypeFor(input.filnavn, input.mimeType);
  sjekkStoerrelse(input.bytes.byteLength);

  const { data: brand } = await admin
    .from("company_brand")
    .select(kolonne)
    .eq("company_id", input.companyId)
    .maybeSingle();
  const forrige = (brand as Record<string, string | null> | null)?.[kolonne] ?? null;

  // Tidsstempel i navnet, ellers ville nettleseren vist det gamle bildet fra
  // cachen etter en utskifting.
  const endelse =
    (input.filnavn.split(".").pop() ?? "").toLowerCase() ||
    contentType.split("/")[1].replace("+xml", "");
  const path = `${input.companyId}/${input.type}-${Date.now()}.${endelse}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, input.bytes, { contentType, upsert: false });
  if (uploadError) throw new Error(`Opplasting feilet: ${uploadError.message}`);

  const { error: dbError } = await admin
    .from("company_brand")
    .upsert({ company_id: input.companyId, [kolonne]: path }, { onConflict: "company_id" });
  if (dbError) throw new Error(dbError.message);

  if (forrige) await admin.storage.from(BUCKET).remove([forrige]);

  return path;
}
