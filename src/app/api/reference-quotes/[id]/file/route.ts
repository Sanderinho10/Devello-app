import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Åpner en referansefil.
 *
 * Bøtta er privat, så vi signerer en kortlevd URL og sender brukeren dit i
 * stedet for å strømme filen gjennom appen. Tilgangen blir sjekket her — vi
 * slår opp raden på både id og company_id, så en id fra et annet selskap gir
 * 404 og ikke en lenke.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const admin = supabaseAdmin();

  const { data: reference } = await admin
    .from("reference_quotes")
    .select("storage_path, file_name")
    .eq("id", id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!reference?.storage_path) {
    return NextResponse.json({ error: "Fant ikke filen" }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from("reference-files")
    .createSignedUrl(reference.storage_path, 60);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke åpne filen" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
