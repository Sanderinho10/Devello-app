import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import {
  BILDEKOLONNE,
  BUCKET,
  UgyldigBilde,
  lagreMerkevarebilde,
} from "@/lib/brand/lagre-bilde";
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

function kolonneFor(type: string): string | null {
  return BILDEKOLONNE[type] ?? null;
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

    const path = await lagreMerkevarebilde(supabaseAdmin(), {
      companyId: session.companyId,
      type: type as "logo" | "signatur",
      bytes: Buffer.from(await file.arrayBuffer()),
      filnavn: file.name,
      mimeType: file.type,
    });

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    return errorResponse(err, err instanceof UgyldigBilde ? 400 : 500);
  }
}

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
