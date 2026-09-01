import type { SupabaseClient } from "@supabase/supabase-js";
import { extractFileText } from "./extract-text";
import { indexReferenceFile } from "./index-reference-file";
import { anonymiser } from "@/lib/personvern/anonymiser";
import type { QuoteType } from "@/lib/types";

/**
 * Én referansefil, fra lagret PDF til søkbar rad.
 *
 * Delt mellom ruta som leser én fil om gangen (og lar UI-et vise hvor langt
 * den er kommet) og engangsruta som går gjennom alle. De to skal ikke kunne
 * drive fra hverandre i hva «lest» betyr.
 */

export interface Referansefil {
  id: string;
  title: string;
  type: string;
  storage_path: string | null;
  file_name: string | null;
  extracted_text: string | null;
}

export type LesingStatus =
  /** Teksten er hentet ut og fila ligger i den søkbare poolen. */
  | "indeksert"
  /** Lå der fra før — ruta kan kjøres om igjen uten å duplisere noe. */
  | "alt_indeksert"
  /** Verken tekstlag eller modellen fikk noe ut av den. */
  | "ingen_tekst";

export async function lesOgIndekser(
  admin: SupabaseClient,
  companyId: string,
  fil: Referansefil,
  alleredeIndeksert: boolean,
): Promise<LesingStatus> {
  if (alleredeIndeksert) return "alt_indeksert";

  // Hent teksten om den mangler — det er hele poenget.
  let tekst = fil.extracted_text;
  if (!tekst && fil.storage_path) {
    const { data: blob } = await admin.storage
      .from("reference-files")
      .download(fil.storage_path);
    if (blob) {
      const bytes = Buffer.from(await blob.arrayBuffer());
      // Samme anonymisering som ved opplasting, ellers ville en re-indeksering
      // lagt de ekte navnene tilbake i kolonnen.
      tekst =
        anonymiser(
          await extractFileText(bytes, fil.file_name ?? fil.title, {
            companyId,
            kind: "lesing_skanna_pdf",
          }),
        ) || null;
      if (tekst) {
        await admin
          .from("reference_quotes")
          .update({ extracted_text: tekst })
          .eq("id", fil.id);
      }
    }
  }

  if (!tekst) return "ingen_tekst";

  await indexReferenceFile(admin, {
    companyId,
    referenceQuoteId: fil.id,
    title: fil.title,
    quoteType: fil.type as QuoteType,
    extractedText: tekst,
  });
  return "indeksert";
}

/** Id-ene til referansefilene som allerede står i den søkbare poolen. */
export async function indekserteFiler(
  admin: SupabaseClient,
  companyId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("quote_references")
    .select("reference_quote_id")
    .eq("company_id", companyId)
    .not("reference_quote_id", "is", null);

  return new Set((data ?? []).map((rad) => rad.reference_quote_id as string));
}
