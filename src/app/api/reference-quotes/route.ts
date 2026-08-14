import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const form = await request.formData();
    const title = String(form.get("title") ?? "").trim();
    const type = String(form.get("type") ?? "");
    const jobDescription = String(form.get("job_description") ?? "").trim();
    const file = form.get("file");

    if (!title || !type) {
      return NextResponse.json(
        { error: "Tittel og type er påkravd" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    let storagePath: string | null = null;
    let fileName: string | null = null;
    let mimeType: string | null = null;
    let extractedText: string | null = null;

    if (file instanceof File && file.size > 0) {
      fileName = file.name;
      mimeType = file.type || "application/octet-stream";
      storagePath = `${session.companyId}/${Date.now()}-${sanitize(file.name)}`;

      const bytes = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await admin.storage
        .from("reference-files")
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) throw new Error(`Opplasting feila: ${uploadError.message}`);

      // Rein tekst kan lesast direkte. PDF- og Word-uthenting kjem seinare —
      // fram til då er det job_description som ber klassifiseringa.
      if (mimeType.startsWith("text/")) {
        extractedText = bytes.toString("utf8").slice(0, 50_000);
      }
    }

    const { error } = await admin.from("reference_quotes").insert({
      company_id: session.companyId,
      title,
      type,
      job_description: jobDescription || null,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mimeType,
      extracted_text: extractedText,
    });

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Manglar id" }, { status: 400 });

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
