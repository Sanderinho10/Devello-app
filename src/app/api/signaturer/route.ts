import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BUCKET } from "@/lib/dokumentasjon/dokument";
import { hentSignaturer } from "@/lib/dokumentasjon/signatur";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAKS_BILDE = 2 * 1024 * 1024;
const TYPER: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * Lagrede signaturer.
 *
 * GET gir selskapets signaturer, med kan_bruke for den innloggede. POST
 * (multipart: name, title?, user_id?, file) lagrer en ny — bare
 * administrator. Bildet er tegnet på skjermen eller lastet opp, og ligger i
 * order-documents-bøtta under <selskap>/signaturer/.
 */
export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const signaturer = await hentSignaturer(admin, session.companyId, session.userId, await erAdmin(admin, session));
    return NextResponse.json({ signaturer });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan legge inn signaturer." }, { status: 403 });
    }

    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim().slice(0, 120);
    const title = String(form.get("title") ?? "").trim().slice(0, 120) || null;
    const userId = String(form.get("user_id") ?? "").trim() || null;
    const file = form.get("file");
    if (!name) return NextResponse.json({ error: "Skriv navnet som skal stå under signaturen." }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Tegn signaturen eller last opp et bilde." }, { status: 400 });
    if (file.size > MAKS_BILDE) return NextResponse.json({ error: "Bildet er større enn 2 MB." }, { status: 400 });
    const ext = TYPER[file.type];
    if (!ext) return NextResponse.json({ error: "Signaturen må være PNG, JPG eller WebP." }, { status: 400 });
    if (userId) {
      const kolleger = await brukereISelskap(admin, session.companyId);
      if (!kolleger.some((k) => k.id === userId)) {
        return NextResponse.json({ error: "Brukeren er ikke med i selskapet." }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const sti = `${session.companyId}/signaturer/${id}.${ext}`;
    const { error: opplasting } = await admin.storage
      .from(BUCKET)
      .upload(sti, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
    if (opplasting) throw new Error(`Opplasting feilet: ${opplasting.message}`);

    const { data, error } = await admin
      .from("company_signatures")
      .insert({ id, company_id: session.companyId, name, title, user_id: userId, image_path: sti, mime_type: file.type, created_by: session.userId })
      .select("id, name, title, user_id")
      .single();
    if (error) {
      await admin.storage.from(BUCKET).remove([sti]);
      throw new Error(error.message);
    }
    return NextResponse.json({ ...data, kan_bruke: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
