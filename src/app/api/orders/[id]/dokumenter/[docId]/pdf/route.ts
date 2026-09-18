import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET, lagDokumentPdf, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 120;

/**
 * PDF-en. Ferdig skjema: den lagrede fila, via signert lenke. Utkast:
 * rendres på nytt hver gang, merket UTKAST, og strømmes rett ut.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    if (dok.kind !== "skjema") return NextResponse.json({ error: "Bare skjema har PDF. Bruk /fil for opplastede filer." }, { status: 400 });

    if (dok.status === "ferdig" && dok.pdf_path) {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(dok.pdf_path, 60);
      if (error || !data) throw new Error(error?.message ?? "Kunne ikke åpne PDF-en");
      return NextResponse.redirect(data.signedUrl);
    }

    const { bytes } = await lagDokumentPdf(admin, r.ordre, dok, null);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="utkast-${dok.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
