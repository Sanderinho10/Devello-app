import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { overforUtkast, utkastMedId } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Overfør den godkjente fakturaen til regnskapssystemet som ordreutkast.
 * Se overforUtkast (lib/faktura/handlingar.ts) for body og svar.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await utkastMedId(admin, session, id);
    if (r instanceof NextResponse) return r;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await overforUtkast(admin, session, r, body);
  } catch (err) {
    return errorResponse(err);
  }
}
