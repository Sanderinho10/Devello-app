import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentOrdreliste } from "@/lib/app/lese";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Ordrelista for montørappen.
 *
 *   GET /api/app/ordrar?status=aktive|alle&q=&limit=200
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const p = request.nextUrl.searchParams;
    const status = p.get("status") === "alle" ? "alle" : "aktive";
    const q = (p.get("q") ?? "").slice(0, 100);
    const limitRaa = Number(p.get("limit") ?? "200");
    const limit = Number.isInteger(limitRaa) && limitRaa > 0 ? Math.min(limitRaa, 500) : 200;

    const ordrar = await hentOrdreliste(admin, session.companyId, session.userId, { status, q, limit });
    return NextResponse.json({ ordrar });
  } catch (err) {
    return errorResponse(err);
  }
}
