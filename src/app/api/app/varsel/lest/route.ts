import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Merk varsel som lesne.
 *
 *   POST /api/app/varsel/lest  { ids: ["uuid", …] }   — desse
 *   POST /api/app/varsel/lest  {}                     — alle
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
    let q = supabaseAdmin()
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", session.userId)
      .is("read_at", null);
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter((i): i is string => typeof i === "string").slice(0, 500);
      if (ids.length === 0) return NextResponse.json({ ok: true });
      q = q.in("id", ids);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
