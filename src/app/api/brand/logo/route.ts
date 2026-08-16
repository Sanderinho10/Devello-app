import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Logoen: last opp, hent, slett.
 *
 * Fila ligger i en privat bøtte og serveres bare gjennom denne ruta, som
 * krever sesjon. PDF-en bygger den inn som data-URI i stedet for å lenke hit
 * — Chromium har ingen sesjon, og en PDF skal uansett ikke være avhengig av
 * at en server svarer i det øyeblikket den lages.
 */

const BUCKET = "brand-logos";

const TYPER: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const MAKS_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Ingen fil." }, { status: 400 });
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const contentType = TYPER[ext];
    if (!contentType) {
      return NextResponse.json(
        { error: "Logoen må være PNG, JPG, WEBP eller SVG." },
        { status: 400 },
      );
    }
    if (file.size > MAKS_BYTES) {
      return NextResponse.json(
        { error: "Logoen kan være opptil 2 MB. Skaler den ned først." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: brand } = await admin
      .from("company_brand")
      .select("logo_path")
      .eq("company_id", session.companyId)
      .maybeSingle();

    // Tidsstempel i navnet, ellers ville nettleseren vist den gamle logoen
    // fra cachen etter en utskifting.
    const path = `${session.companyId}/logo-${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (uploadError) throw new Error(`Opplasting feilet: ${uploadError.message}`);

    const { error: dbError } = await admin
      .from("company_brand")
      .upsert({ company_id: session.companyId, logo_path: path }, { onConflict: "company_id" });
    if (dbError) throw new Error(dbError.message);

    // Den gamle først når den nye er trygt på plass.
    if (brand?.logo_path) {
      await admin.storage.from(BUCKET).remove([brand.logo_path]);
    }

    return NextResponse.json({ ok: true, logo_path: path });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const admin = supabaseAdmin();
  const { data: brand } = await admin
    .from("company_brand")
    .select("logo_path")
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!brand?.logo_path) {
    return NextResponse.json({ error: "Ingen logo." }, { status: 404 });
  }

  const { data, error } = await admin.storage.from(BUCKET).download(brand.logo_path);
  if (error || !data) {
    return NextResponse.json({ error: "Fant ikke logofilen." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // Stien har tidsstempel, så innholdet på en gitt sti endrer seg aldri.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const { data: brand } = await admin
      .from("company_brand")
      .select("logo_path")
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (brand?.logo_path) {
      await admin.storage.from(BUCKET).remove([brand.logo_path]);
    }
    await admin
      .from("company_brand")
      .upsert({ company_id: session.companyId, logo_path: null }, { onConflict: "company_id" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
