import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { indekserteFiler, lesOgIndekser } from "@/lib/referanser/les-og-indekser";

export const maxDuration = 300;

/**
 * Les og indekser ÉN referansefil.
 *
 * Én fil per kall, slik at klienten kan vise hvor langt den er kommet. En
 * skannet PDF leses av modellen og tar noen sekunder; fjorten av dem i samme
 * kall er både en tidsavbruddsrisiko og en framdriftsvisning man ikke kan
 * lage — man vet bare at det står og går.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();

    const { data: fil } = await admin
      .from("reference_quotes")
      .select("id, title, type, storage_path, file_name, extracted_text")
      .eq("id", id)
      // Selskapet kommer fra sesjonen: id-en i URL-en er ikke tilgang.
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (!fil) {
      return NextResponse.json({ error: "Fant ikke filen" }, { status: 404 });
    }

    const indeksert = await indekserteFiler(admin, session.companyId);
    const status = await lesOgIndekser(
      admin,
      session.companyId,
      fil,
      indeksert.has(fil.id),
    );

    return NextResponse.json({ status });
  } catch (err) {
    return errorResponse(err);
  }
}
