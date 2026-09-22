import { NextResponse } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Et vedlegg på et lead, til visning i nettleseren.
 *
 * Tabellen og bucketen er bare for service role; tilgangen avgjøres her, av
 * selskapet i sesjonen — ikke av at noen kjenner id-en.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; vid: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id, vid } = await params;
  const admin = supabaseAdmin();

  const { data: rad } = await admin
    .from("lead_attachments")
    .select("file_name, mime_type, storage_path")
    .eq("id", vid)
    .eq("lead_id", id)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!rad) return NextResponse.json({ error: "Fant ikke vedlegget" }, { status: 404 });

  const { data: blob } = await admin.storage.from("lead-attachments").download(rad.storage_path);
  if (!blob) return NextResponse.json({ error: "Filen mangler" }, { status: 404 });

  return new NextResponse(blob, {
    headers: {
      "Content-Type": rad.mime_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(rad.file_name)}`,
      // Vedlegget endrer seg aldri; det private hurtiglageret sparer nye
      // nedlastinger når siden oppdateres.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
