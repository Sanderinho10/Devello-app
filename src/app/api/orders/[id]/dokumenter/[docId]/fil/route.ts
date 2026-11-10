import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

const GYLDIG_S = 300;

/**
 * Åpner en opplastet fil via signert lenke. Tilgangen sjekkes på ordren.
 * ?format=json gir { url, expires_in } i stedet for redirect — appen viser
 * bildet med <Image source={{ uri }}> og kan ikke sende headers via redirect.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const sti = r.dok!.storage_path;
    if (!sti) return NextResponse.json({ error: "Dokumentet har ingen fil." }, { status: 404 });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(sti, GYLDIG_S);
    if (error || !data) throw new Error(error?.message ?? "Kunne ikke åpne fila");
    if (request.nextUrl.searchParams.get("format") === "json") {
      return NextResponse.json({ url: data.signedUrl, expires_in: GYLDIG_S });
    }
    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    return errorResponse(err);
  }
}
