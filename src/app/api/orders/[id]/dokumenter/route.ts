import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET, ordreOgDokument, prefillKontekst } from "@/lib/dokumentasjon/dokument";
import { finnMal, malarForFag } from "@/lib/dokumentasjon/malar";
import { prefillData } from "@/lib/dokumentasjon/motor";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAKS_FIL = 25 * 1024 * 1024;

/**
 * Nytt dokument på ordren.
 *
 * JSON { kind: "skjema", template_key } → skjema fra mal, forhåndsutfylt.
 * Multipart { kind: "fil", file } → fila lastes opp til order-documents
 * (bilde fra mobilkameraet, PDF, datablad).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (r.ordre.status === "avbrutt") return NextResponse.json({ error: "Ordren er avbrutt." }, { status: 400 });

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Fil er påkrevd." }, { status: 400 });
      if (file.size > MAKS_FIL) return NextResponse.json({ error: "Fila er større enn 25 MB." }, { status: 400 });
      const mime = file.type || "application/octet-stream";
      if (!/^image\/|^application\/pdf$/.test(mime)) {
        return NextResponse.json({ error: "Bare bilder og PDF kan lastes opp." }, { status: 400 });
      }
      const tittel = (String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);
      const { data: rad, error } = await admin
        .from("order_documents")
        .insert({
          company_id: session.companyId,
          order_id: r.ordre.id,
          kind: "fil",
          title: tittel,
          status: "ferdig",
          file_name: file.name,
          mime_type: mime,
          created_by: session.userId,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const sti = `${session.companyId}/${r.ordre.id}/${rad.id}-${sanitize(file.name)}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(sti, bytes, { contentType: mime, upsert: false });
      if (uploadError) {
        await admin.from("order_documents").delete().eq("id", rad.id);
        throw new Error(`Opplasting feilet: ${uploadError.message}`);
      }
      const { data: ferdig } = await admin.from("order_documents").update({ storage_path: sti }).eq("id", rad.id).select("*").single();
      return NextResponse.json(ferdig);
    }

    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; template_key?: unknown };
    if (body.kind !== "skjema") return NextResponse.json({ error: "kind må være «skjema», eller send fila som multipart." }, { status: 400 });
    const mal = typeof body.template_key === "string" ? finnMal(body.template_key) : null;
    if (!mal) return NextResponse.json({ error: "Ukjent mal." }, { status: 400 });

    const { data: company } = await admin.from("companies").select("fag").eq("id", session.companyId).single();
    if (!malarForFag(company?.fag).some((m) => m.key === mal.key)) {
      return NextResponse.json({ error: "Malen hører ikke til selskapets fag." }, { status: 400 });
    }

    const ctx = await prefillKontekst(admin, r.ordre, session.userId);
    const { data, error } = await admin
      .from("order_documents")
      .insert({
        company_id: session.companyId,
        order_id: r.ordre.id,
        kind: "skjema",
        template_key: mal.key,
        template_version: mal.version,
        title: mal.title,
        data: prefillData(mal, ctx),
        status: "utkast",
        created_by: session.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-æøåÆØÅ]+/g, "_").slice(0, 120);
}
