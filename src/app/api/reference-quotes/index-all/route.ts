import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { extractFileText } from "@/lib/referanser/extract-text";
import { indexReferenceFile } from "@/lib/referanser/index-reference-file";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteType } from "@/lib/types";
import { anonymiser } from "@/lib/personvern/anonymiser";

export const maxDuration = 300;

/**
 * Engangskjøring: trekk ut tekst og indekser referansefiler som ble lastet opp
 * før uthentingen fantes.
 *
 * Idempotent — filer som allerede har en rad i poolen hoppes over, så ruta kan
 * kalles igjen uten å duplisere noe. Kjør den én gang per selskap etter
 * utrulling (POST /api/reference-quotes/index-all), eller igjen etter at
 * eldre filer er lastet opp på nytt i bedre kvalitet.
 */
export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();

    const { data: files } = await admin
      .from("reference_quotes")
      .select("id, title, type, storage_path, file_name, extracted_text")
      .eq("company_id", session.companyId)
      .not("storage_path", "is", null);

    const { data: indexed } = await admin
      .from("quote_references")
      .select("reference_quote_id")
      .eq("company_id", session.companyId)
      .not("reference_quote_id", "is", null);

    const alreadyIndexed = new Set(
      (indexed ?? []).map((row) => row.reference_quote_id),
    );

    const report = {
      total: (files ?? []).length,
      indexed: 0,
      skipped_already_indexed: 0,
      skipped_no_text: 0,
      failed: [] as string[],
    };

    for (const file of files ?? []) {
      if (alreadyIndexed.has(file.id)) {
        report.skipped_already_indexed += 1;
        continue;
      }

      try {
        // Hent teksten om den mangler — det er hele poenget med ruta.
        let text = file.extracted_text as string | null;
        if (!text) {
          const { data: blob } = await admin.storage
            .from("reference-files")
            .download(file.storage_path);
          if (blob) {
            const bytes = Buffer.from(await blob.arrayBuffer());
            // Samme anonymisering som ved opplasting, ellers ville en
            // re-indeksering lagt de ekte navnene tilbake i kolonnen.
            text = anonymiser(
              await extractFileText(bytes, file.file_name ?? file.title),
            ) || null;
            if (text) {
              await admin
                .from("reference_quotes")
                .update({ extracted_text: text })
                .eq("id", file.id);
            }
          }
        }

        if (!text) {
          report.skipped_no_text += 1;
          continue;
        }

        await indexReferenceFile(admin, {
          companyId: session.companyId,
          referenceQuoteId: file.id,
          title: file.title,
          quoteType: file.type as QuoteType,
          extractedText: text,
        });
        report.indexed += 1;
      } catch (err) {
        report.failed.push(
          `${file.title}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return NextResponse.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
