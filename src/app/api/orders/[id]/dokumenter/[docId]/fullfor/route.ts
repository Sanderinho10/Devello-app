import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { klarTilFullfoering, lagDokumentPdf, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * «Fullfør og signer»: påkrevde felt sjekkes, PDF lages med signaturblokk,
 * skjemaet låses. Signaturen er innlogget bruker + tidsstempel — tydelig
 * merket «Signert i Devello av …» på arket.
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
    if (dok.kind !== "skjema") return NextResponse.json({ error: "Bare skjema kan fullføres." }, { status: 400 });
    if (dok.status === "ferdig") return NextResponse.json(dok);

    const manglar = klarTilFullfoering(dok);
    if (manglar.length) {
      return NextResponse.json({ error: "Skjemaet mangler påkrevde felt.", manglar }, { status: 400 });
    }

    const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
    const navn = user?.full_name || user?.email || "ukjent bruker";
    const naa = new Date().toISOString();

    const { path } = await lagDokumentPdf(admin, r.ordre, dok, { name: navn, at: naa });

    const { data, error } = await admin
      .from("order_documents")
      .update({ status: "ferdig", pdf_path: path, signed_by: session.userId, signed_name: navn, signed_at: naa })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: `${dok.title} fullført og signert av ${navn}`,
      created_by: session.userId,
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
