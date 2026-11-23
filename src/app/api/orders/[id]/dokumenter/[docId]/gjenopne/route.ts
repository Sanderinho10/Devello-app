import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { BUCKET, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Gjenåpner et ferdig skjema (administrator).
 *
 * Er dokumentet sendt til Boligmappa, røres det ikke: det som ligger hos
 * kunden skal også ligge her. I stedet lages en kopi som utkast — samme
 * innhold, neste versjonsnummer — og svaret er kopien ({ kopi: true }).
 * Begge versjonene står på ordren, og den nye sendes som et eget dokument.
 *
 * Er det ikke sendt, åpnes det på stedet: tilbake til utkast, PDF-en
 * slettes, signaturen nullstilles.
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

    const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
    const hvem = user?.full_name || user?.email || "administrator";

    if (dok.boligmappa_file_id) {
      // Neste versjon blant skjemaene av samme mal på ordren — også når
      // en eldre versjon gjenåpnes en gang til.
      const { data: same } = await admin
        .from("order_documents")
        .select("revision")
        .eq("order_id", r.ordre.id)
        .eq("company_id", session.companyId)
        .eq("template_key", dok.template_key ?? "");
      const revisjon = Math.max(dok.revision ?? 1, ...(same ?? []).map((d) => Number(d.revision) || 1)) + 1;

      const { data: kopi, error } = await admin
        .from("order_documents")
        .insert({
          company_id: dok.company_id,
          order_id: dok.order_id,
          kind: "skjema",
          template_key: dok.template_key,
          template_version: dok.template_version,
          title: dok.title,
          data: dok.data,
          status: "utkast",
          created_by: session.userId,
          copied_from: dok.id,
          revision: revisjon,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await admin.from("order_events").insert({
        order_id: r.ordre.id,
        kind: "dokumentasjon",
        note: `${dok.title}: ny versjon ${revisjon} laget av ${hvem} — den sendte versjonen står`,
        created_by: session.userId,
      });
      return NextResponse.json({ ...kopi, kopi: true });
    }

    if (dok.pdf_path) await admin.storage.from(BUCKET).remove([dok.pdf_path]);
    const { data, error } = await admin
      .from("order_documents")
      .update({
        status: "utkast",
        pdf_path: null,
        signed_by: null,
        signed_name: null,
        signed_at: null,
        signature_id: null,
        approval_requested_at: null,
        approval_requested_by: null,
        boligmappa_error: null,
      })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: `${dok.title} gjenåpnet av ${hvem}`,
      created_by: session.userId,
    });
    return NextResponse.json({ ...data, kopi: false });
  } catch (err) {
    return errorResponse(err);
  }
}
