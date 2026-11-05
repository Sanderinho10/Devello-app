import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { FakturaFeil, lagFakturaforslag } from "@/lib/faktura/generer";
import { redigerUtkast } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

/**
 * POST  — lag (eller lag på nytt) fakturaforslaget for ordren.
 * PATCH — brukerens redigering (lib/faktura/handlingar.ts). Det samme
 * finnes på /api/fakturaer/[id], som fakturafanen bruker.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;

    const { data: company } = await admin
      .from("companies")
      .select("name, tone_settings")
      .eq("id", session.companyId)
      .single();

    const draft = await lagFakturaforslag(admin, {
      ordre: r.ordre,
      company: (company ?? { name: "", tone_settings: {} }) as Pick<Company, "name" | "tone_settings">,
      userId: session.userId,
    });
    return NextResponse.json(draft);
  } catch (err) {
    if (err instanceof FakturaFeil) return errorResponse(err, err.status);
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await redigerUtkast(admin, session, { draft: r.draft, ordre: r.ordre }, body);
  } catch (err) {
    return errorResponse(err);
  }
}
