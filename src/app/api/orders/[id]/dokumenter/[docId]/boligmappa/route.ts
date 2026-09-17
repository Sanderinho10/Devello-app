import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgDokument, sendTilBoligmappa } from "@/lib/dokumentasjon/dokument";
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
