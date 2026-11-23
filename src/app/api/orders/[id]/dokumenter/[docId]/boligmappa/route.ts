import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { fjernFraBoligmappa, ordreOgDokument, sendTilBoligmappa } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Send ett dokument til Boligmappa. Body: { chapterTagName? } for filer. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const body = (await request.json().catch(() => ({}))) as { chapterTagName?: unknown };
    const res = await sendTilBoligmappa(admin, r.ordre, r.dok!, {
      chapterTagName: typeof body.chapterTagName === "string" ? body.chapterTagName : null,
    });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    return NextResponse.json(res);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Fjerner dokumentet fra Boligmappa (administrator): fila firmaet selv la
 * på eiendommen slettes der, og dokumentet står igjen på ordren som ikke
 * sendt — klart til å sendes på nytt, gjenåpnes eller slettes.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
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
    if (!dok.boligmappa_file_id) return NextResponse.json({ ok: true });
    const res = await fjernFraBoligmappa(admin, r.ordre, dok);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

    const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: `${dok.title} slettet fra Boligmappa av ${user?.full_name || user?.email || "administrator"}`,
      created_by: session.userId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
