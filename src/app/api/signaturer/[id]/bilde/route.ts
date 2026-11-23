import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Signaturbildet, via en kort signert lenke. Selskapet sjekkes i spørringen. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const { data: signatur } = await admin
      .from("company_signatures")
      .select("image_path")
      .eq("id", id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!signatur) return NextResponse.json({ error: "Fant ikke signaturen." }, { status: 404 });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(signatur.image_path, 120);
    if (error || !data) throw new Error(error?.message ?? "Kunne ikke åpne bildet");
    return NextResponse.redirect(data.signedUrl);
  } catch (err) {
    return errorResponse(err);
  }
}
