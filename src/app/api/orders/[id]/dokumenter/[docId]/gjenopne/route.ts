import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { BUCKET, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Gjenåpner et ferdig skjema (administrator): tilbake til utkast, PDF-en
 * slettes, Boligmappa-feltene nullstilles — en ny sending kreves. Fila som
 * alt ligger i Boligmappa blir liggende der; den nye sendingen kommer i
 * tillegg, og hendelsesloggen sier hvem som gjenåpnet.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    if (dok.kind !== "skjema" || dok.status !== "ferdig") return NextResponse.json(dok);

    if (dok.pdf_path) await admin.storage.from(BUCKET).remove([dok.pdf_path]);
    const { data, error } = await admin
      .from("order_documents")
      .update({
        status: "utkast",
        pdf_path: null,
        signed_by: null,
        signed_name: null,
        signed_at: null,
        boligmappa_file_id: null,
        boligmappa_sent_at: null,
        boligmappa_error: null,
      })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: `${dok.title} gjenåpnet av ${user?.full_name || user?.email || "administrator"}`,
      created_by: session.userId,
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
