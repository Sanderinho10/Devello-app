import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Åpner en opplastet fil via signert lenke. Tilgangen sjekkes på ordren. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const sti = r.dok!.storage_path;
    if (!sti) return NextResponse.json({ error: "Dokumentet har ingen fil." }, { status: 404 });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(sti, 60);
    if (error || !data) throw new Error(error?.message ?? "Kunne ikke åpne fila");
    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    return errorResponse(err);
  }
}
