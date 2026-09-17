import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET, malFor, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { rensData } from "@/lib/dokumentasjon/motor";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * PATCH { data } — autolagring fra skjemaet; { title } — nytt navn.
 * Avvises når dokumentet er ferdig: da må en administrator gjenåpne det.
 * DELETE — bare utkast.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    if (dok.status === "ferdig" && dok.kind === "skjema") {
      return NextResponse.json({ error: "Skjemaet er fullført og signert. En administrator kan gjenåpne det." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { data?: unknown; title?: unknown };
    const endringer: Record<string, unknown> = {};
    if (body.data !== undefined) {
      const mal = malFor(dok);
      if (!mal) return NextResponse.json({ error: "Bare skjema har feltdata." }, { status: 400 });
      endringer.data = rensData(mal, body.data);
    }
    if (body.title !== undefined) {
      const t = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
      if (!t) return NextResponse.json({ error: "Tittel mangler." }, { status: 400 });
      endringer.title = t;
    }
    if (Object.keys(endringer).length === 0) return NextResponse.json(dok);

    const { data, error } = await admin.from("order_documents").update(endringer).eq("id", dok.id).select("*").single();
    if (error) throw new Error(error.message);
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
    if (dok.kind === "skjema" && dok.status === "ferdig") {
      return NextResponse.json({ error: "Et ferdig skjema kan ikke slettes. En administrator kan gjenåpne det." }, { status: 400 });
    }
    if (dok.boligmappa_file_id) {
      return NextResponse.json({ error: "Dokumentet er sendt til Boligmappa og kan ikke slettes her." }, { status: 400 });
    }
    const stiar = [dok.storage_path, dok.pdf_path].filter((s): s is string => Boolean(s));
    if (stiar.length) await admin.storage.from(BUCKET).remove(stiar);
    const { error } = await admin.from("order_documents").delete().eq("id", dok.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
