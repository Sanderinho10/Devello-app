import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Bilane og lagerromma i selskapet.
 *
 * GET gir dei som er i bruk (?alle=1 også dei som er tekne ut). Montøren
 * sin eigen bil står først — det er den han tek varer frå.
 *
 * POST opprettar ein ny. Nummeret kjem frå same løpenummerserie som
 * ordrane, så grossistfakturaen finn bilen på same måten som ein ordre, og
 * eit nummer aldri kan tyde to ting.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    let sporring = admin.from("stock_locations").select("*").eq("company_id", session.companyId).order("location_no");
    if (request.nextUrl.searchParams.get("alle") !== "1") sporring = sporring.eq("active", true);
    const { data, error } = await sporring;
    if (error) throw new Error(error.message);

    const lager = (data ?? []).sort(
      (a, b) => Number(b.user_id === session.userId) - Number(a.user_id === session.userId) || a.location_no - b.location_no,
    );
    return NextResponse.json({ lager });
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
      return NextResponse.json({ error: "Bare administratorer kan opprette biler og lager." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Gi bilen et navn." }, { status: 400 });

    let userId: string | null = null;
    if (typeof body.user_id === "string" && body.user_id) {
      const bruker = (await brukereISelskap(admin, session.companyId)).find((b) => b.id === body.user_id);
      if (!bruker) return NextResponse.json({ error: "Fant ikke montøren." }, { status: 400 });
      userId = bruker.id;
    }

    const { data: nr, error: nrFeil } = await admin.rpc("neste_ordrenummer", { p_company: session.companyId });
    if (nrFeil || typeof nr !== "number") throw new Error(nrFeil?.message ?? "Kunne ikke dele ut nummer");

    const { data, error } = await admin
      .from("stock_locations")
      .insert({
        company_id: session.companyId,
        location_no: nr,
        name,
        kind: body.kind === "lager" ? "lager" : "bil",
        reg_no: tekst(body.reg_no),
        user_id: userId,
        note: tekst(body.note),
        created_by: session.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

function tekst(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
