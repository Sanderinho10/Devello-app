import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { klarTilFullfoering, malFor, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Montøren ber om godkjenning: skjemaet er ferdig utfylt og venter på en
 * som har signatur. POST setter merket, DELETE tar det bort igjen. Skjemaet
 * er fortsatt utkast og kan rettes av den som godkjenner.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    const mal = malFor(dok);
    if (!mal?.signature.required) return NextResponse.json({ error: "Dette skjemaet trenger ikke godkjenning." }, { status: 400 });
    if (dok.status === "ferdig" || dok.approval_requested_at) return NextResponse.json(dok);

    const manglar = klarTilFullfoering(dok);
    if (manglar.length) {
      return NextResponse.json({ error: "Skjemaet mangler påkrevde felt.", manglar }, { status: 400 });
    }

    const { data, error } = await admin
      .from("order_documents")
      .update({ approval_requested_at: new Date().toISOString(), approval_requested_by: session.userId })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: `${dok.title} sendt til godkjenning av ${user?.full_name || user?.email || "montøren"}`,
      created_by: session.userId,
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    if (dok.status === "ferdig" || !dok.approval_requested_at) return NextResponse.json(dok);
    const { data, error } = await admin
      .from("order_documents")
      .update({ approval_requested_at: null, approval_requested_by: null })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
