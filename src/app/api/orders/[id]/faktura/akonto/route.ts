import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { lagAkonto } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST — ny akontofaktura på ordren (0071). Body: { amount?, percent? }.
 * Se lagAkonto (lib/faktura/handlingar.ts). Utkastet redigeres, godkjennes
 * og overføres etterpå gjennom /api/fakturaer/[id], som enhver faktura.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await lagAkonto(admin, session, r.ordre, body);
  } catch (err) {
    return errorResponse(err);
  }
}
