import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erAdmin, erUnikBrot } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hentAktivitetar } from "@/lib/timer/api";

/**
 * Dei interne aktivitetane: det ein kan føre interntid på.
 *
 * GET gir dei aktive (?alle=1 også dei som er tekne ut), og legg inn
 * standardlista for eit selskap som ikkje har nokon. POST legg til ein ny —
 * berre administrator, for lista er felles for alle.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const aktiviteter = await hentAktivitetar(admin, session.companyId, {
      ogsaaInaktive: request.nextUrl.searchParams.get("alle") === "1",
    });
    return NextResponse.json({ aktiviteter });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan endre de interne aktivitetene." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Gi aktiviteten et navn." }, { status: 400 });

    const alle = await hentAktivitetar(admin, session.companyId, { ogsaaInaktive: true });
    const { data, error } = await admin
      .from("internal_activities")
      .insert({
        company_id: session.companyId,
        name,
        position: Math.max(0, ...alle.map((a) => a.position)) + 1,
      })
      .select("*")
      .single();
    if (error) {
      if (erUnikBrot(error)) {
        return NextResponse.json({ error: `«${name}» finnes fra før.` }, { status: 400 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
