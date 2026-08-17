import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Bildene som hører til merkevaren: last opp, hent, slett.
 *
 * To av dem i dag — logoen øverst i tilbudet, og bildet nederst i
 * e-postsignaturen. De oppfører seg likt på alle måter som betyr noe, så de
 * deler rute i stedet for å drive fra hverandre.
 *
 * Filene ligger i en privat bøtte og serveres bare herfra, med sesjon. PDF-en
 * og e-postkladden bygger dem inn i selve dokumentet i stedet for å lenke hit
 * — se lib/pdf/logo.ts.
 */

const BUCKET = "brand-logos";

const KOLONNE: Record<string, string> = {
  logo: "logo_path",
  signatur: "signature_image_path",
};

const TYPER: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
};

const MAKS_BYTES = 2 * 1024 * 1024;

function kolonneFor(type: string): string | null {
  return KOLONNE[type] ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { type } = await params;
  const kolonne = kolonneFor(type);
  if (!kolonne) {
    return NextResponse.json({ error: "Ukjent bildetype." }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Ingen fil." }, { status: 400 });
    }

    // Et limt inn bilde fra utklippstavlen heter «image.png» eller ingenting,
    // så filendelsen alene holder ikke. MIME-typen er den pålitelige kilden.
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const contentType = TYPER[ext] ?? (file.type in ALLOWED_MIME ? file.type : null);
    if (!contentType) {
      return NextResponse.json(
        { error: "Bildet må være PNG, JPG, WEBP, GIF eller SVG." },
        { status: 400 },
      );
    }
    if (file.size > MAKS_BYTES) {
      return NextResponse.json(
        { error: "Bildet kan være opptil 2 MB. Skaler det ned først." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: brand } = await admin
      .from("company_brand")
      .select(kolonne)
      .eq("company_id", session.companyId)
      .maybeSingle();

    const forrige = (brand as Record<string, string | null> | null)?.[kolonne] ?? null;

    // Tidsstempel i navnet, ellers ville nettleseren vist det gamle bildet fra
    // cachen etter en utskifting.
    const endelse = ext || contentType.split("/")[1].replace("+xml", "");
    const path = `${session.companyId}/${type}-${Date.now()}.${endelse}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (uploadError) throw new Error(`Opplasting feilet: ${uploadError.message}`);

    const { error: dbError } = await admin
      .from("company_brand")
      .upsert({ company_id: session.companyId, [kolonne]: path }, { onConflict: "company_id" });
    if (dbError) throw new Error(dbError.message);

    // Den gamle først når den nye er trygt på plass.
    if (forrige) await admin.storage.from(BUCKET).remove([forrige]);

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    return errorResponse(err);
  }
}

const ALLOWED_MIME: Record<string, true> = {
  "image/png": true,
  "image/jpeg": true,
  "image/webp": true,
  "image/gif": true,
  "image/svg+xml": true,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { type } = await params;
  const kolonne = kolonneFor(type);
  if (!kolonne) {
    return NextResponse.json({ error: "Ukjent bildetype." }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: brand } = await admin
    .from("company_brand")
    .select(kolonne)
    .eq("company_id", session.companyId)
    .maybeSingle();

  const path = (brand as Record<string, string | null> | null)?.[kolonne] ?? null;
  if (!path) return NextResponse.json({ error: "Ingen fil." }, { status: 404 });

  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    return NextResponse.json({ error: "Fant ikke filen." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      // Stien har tidsstempel, så innholdet på en gitt sti endrer seg aldri.
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { type } = await params;
  const kolonne = kolonneFor(type);
  if (!kolonne) {
    return NextResponse.json({ error: "Ukjent bildetype." }, { status: 404 });
  }

  try {
    const admin = supabaseAdmin();
    const { data: brand } = await admin
      .from("company_brand")
      .select(kolonne)
      .eq("company_id", session.companyId)
      .maybeSingle();

    const path = (brand as Record<string, string | null> | null)?.[kolonne] ?? null;
    if (path) await admin.storage.from(BUCKET).remove([path]);

    await admin
      .from("company_brand")
      .upsert({ company_id: session.companyId, [kolonne]: null }, { onConflict: "company_id" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
