import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const form = await request.formData();
    const type = String(form.get("type") ?? "");
    const file = form.get("file");

    if (!type) {
      return NextResponse.json({ error: "Tilbudstype er påkrevd" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Fil er påkrevd" }, { status: 400 });
    }
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      return NextResponse.json(
        { error: "Bare PDF- og Word-filer kan lastes opp." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const mimeType = file.type || "application/octet-stream";
    const storagePath = `${session.companyId}/${Date.now()}-${sanitize(file.name)}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from("reference-files")
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw new Error(`Opplasting feilet: ${uploadError.message}`);

    // Tittelen er filnavnet uten endelse. Brukeren skal ikke måtte finne på et
    // navn i tillegg til å velge fil og type.
    const title = file.name.replace(/\.[^.]+$/, "").trim() || file.name;

    const { error } = await admin.from("reference_quotes").insert({
      company_id: session.companyId,
      title,
      type,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: mimeType,
      // PDF- og Word-uthenting er ikke implementert. Fram til da er det typen
      // og filnavnet agenten matcher mot, ikke innholdet i filen.
      extracted_text: null,
    });

    if (error) {
      // Raden ble ikke til — la ikke filen bli liggende igjen i storage.
      await admin.storage.from("reference-files").remove([storagePath]);
      throw new Error(error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("reference_quotes")
    .select("storage_path")
    .eq("id", id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (existing?.storage_path) {
    await admin.storage.from("reference-files").remove([existing.storage_path]);
  }

  const { error } = await admin
    .from("reference_quotes")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
