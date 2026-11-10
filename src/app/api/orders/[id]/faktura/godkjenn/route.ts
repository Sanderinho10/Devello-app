import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { godkjennUtkast } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Godkjenner forslaget: et menneske har sett over. Angres med /angre-godkjenning. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    return await godkjennUtkast(admin, session, r.draft);
  } catch (err) {
    return errorResponse(err);
  }
}
