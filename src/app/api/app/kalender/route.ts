import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentHendingar } from "@/lib/kalender/hent";
import { leggTilDagar, startPaaDag } from "@/lib/kalender/tid";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Programmet til montøren i appen.
 *
 *   GET /api/app/kalender?fra=<ISO>&til=<ISO>[&alle=1]
 *
 * Utan fra/til: i dag og 14 dagar fram. Utan alle=1: berre avtalane
 * brukaren er med på. Avtalane har ordren med, så appen kan opne han.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const p = request.nextUrl.searchParams;
    const les = (v: string | null) => {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    };
    const fra = les(p.get("fra")) ?? startPaaDag(new Date());
    let til = les(p.get("til")) ?? leggTilDagar(fra, 14);
    if (til <= fra) til = leggTilDagar(fra, 1);
    if (til.getTime() - fra.getTime() > 120 * 24 * 60 * 60 * 1000) til = leggTilDagar(fra, 120);

    const hendingar = await hentHendingar(admin, session.companyId, {
      fra,
      til,
      brukarId: p.get("alle") === "1" ? null : session.userId,
    });
    return NextResponse.json({ hendingar });
  } catch (err) {
    return errorResponse(err);
  }
}
