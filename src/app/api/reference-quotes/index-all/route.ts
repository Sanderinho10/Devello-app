import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { indekserteFiler, lesOgIndekser } from "@/lib/referanser/les-og-indekser";

export const maxDuration = 300;

/**
 * Les og indekser alle referansefiler som mangler det.
 *
 * UI-et går én fil om gangen for å kunne vise framdrift — se
 * /api/reference-quotes/[id]/les. Denne ruta er samlekjøringen for
 * kommandolinja: én POST, og alt som kan leses er lest.
 *
 * Idempotent: filer som allerede står i poolen hoppes over.
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

    const indeksert = await indekserteFiler(admin, session.companyId);

    const report = {
      total: (files ?? []).length,
      indexed: 0,
      skipped_already_indexed: 0,
      skipped_no_text: 0,
      failed: [] as string[],
    };

    for (const file of files ?? []) {
      try {
        const status = await lesOgIndekser(
          admin,
          session.companyId,
          file,
          indeksert.has(file.id),
        );
        if (status === "indeksert") report.indexed += 1;
        else if (status === "alt_indeksert") report.skipped_already_indexed += 1;
        else report.skipped_no_text += 1;
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
