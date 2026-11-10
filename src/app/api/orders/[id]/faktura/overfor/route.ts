import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { overforUtkast } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Overfør det godkjente forslaget til regnskapssystemet som ordreutkast.
 * Se overforUtkast (lib/faktura/handlingar.ts) for body og svar.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await overforUtkast(admin, session, { draft: r.draft, ordre: r.ordre }, body);
  } catch (err) {
    return errorResponse(err);
  }
}
