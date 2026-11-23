import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET } from "@/lib/dokumentasjon/dokument";
import { erAdmin } from "@/lib/ordre/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Sletter en lagret signatur (administrator). Dokumenter som alt er signert
 * med den, står som de er — signaturen er bygget inn i PDF-en.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan slette signaturer." }, { status: 403 });
    }
    const { data } = await admin
      .from("company_signatures")
      .select("id, image_path")
      .eq("id", id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Fant ikke signaturen." }, { status: 404 });
    const { error } = await admin.from("company_signatures").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await admin.storage.from(BUCKET).remove([data.image_path]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
