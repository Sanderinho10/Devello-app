import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Varsla til den innlogga, nyaste først.
 *
 *   GET /api/app/varsel?limit=50
 *
 * `ulest` er talet til raudprikken på ikonet.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const raa = Number(request.nextUrl.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(raa) && raa > 0 ? Math.min(raa, 200) : 50;

    const [{ data, error }, { count }] = await Promise.all([
      admin
        .from("user_notifications")
        .select("id, kind, title, body, event_id, order_id, read_at, created_at")
        .eq("user_id", session.userId)
        .eq("company_id", session.companyId)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.userId)
        .eq("company_id", session.companyId)
        .is("read_at", null),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ varsel: data ?? [], ulest: count ?? 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
