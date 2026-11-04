import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentTimeforslag } from "@/lib/kalender/hent-timeforslag";
import { osloDato, pluss } from "@/lib/kalender/oslo";
import { dato } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Timeforslag til den innlogga montøren: oppdrag han var sett opp på i
 * kalenderen, men ikkje har ført timar for.
 *
 *   GET /api/app/timeforslag?fra=YYYY-MM-DD&til=YYYY-MM-DD
 *
 * Utan datoar: dei siste 7 dagane til og med i dag. Høgst 31 dagar.
 * Eit forslag blir ført med vanleg POST /api/orders/{order.id}/timer
 * (work_date, price_item_id, hours) — så forsvinn det av seg sjølv.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const p = request.nextUrl.searchParams;
    const til = dato(p.get("til")) ?? osloDato(new Date());
    let fra = dato(p.get("fra")) ?? pluss(til, -6);
    if (fra > til) fra = til;
    if (pluss(fra, 31) < til) fra = pluss(til, -31);

    const forslag = await hentTimeforslag(admin, session.companyId, { fra, til, brukarId: session.userId });
    return NextResponse.json({ forslag });
  } catch (err) {
    return errorResponse(err);
  }
}
