import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { byttSelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Bytt selskapet brukeren står i: `{ company_id }`. Bare til et selskap
 * brukeren har medlemskap i. Uten abonnementskravet — man skal kunne bytte
 * bort fra et selskap som står uten pakke.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;
  try {
    const body = (await request.json().catch(() => ({}))) as { company_id?: unknown };
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!companyId) return NextResponse.json({ error: "Velg et selskap." }, { status: 400 });
    if (companyId === session.companyId) return NextResponse.json({ ok: true });
    const selskap = await byttSelskap(supabaseAdmin(), session.userId, companyId);
    return NextResponse.json({ ok: true, selskap });
  } catch (err) {
    return errorResponse(err, err instanceof Error && /tilgang/.test(err.message) ? 403 : 500);
  }
}
