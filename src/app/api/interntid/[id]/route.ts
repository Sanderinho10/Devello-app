import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erAdmin, erUnikBrot } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Nytt namn på ein intern aktivitet, eller ta han ut av bruk.
 *
 * Ein aktivitet blir aldri sletta: timane som er førte på han skal stå.
 * Teken ut av bruk kjem han ikkje opp i skjemaet, men historikken er urørt
 * — føringane ber sitt eige namn (time_type_name) og endrar seg ikkje om
 * aktiviteten får nytt.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan endre de interne aktivitetene." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: unknown; active?: unknown };
    const endringer: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Gi aktiviteten et navn." }, { status: 400 });
      endringer.name = name;
    }
    if (body.active !== undefined) endringer.active = Boolean(body.active);
    if (Object.keys(endringer).length === 0) return NextResponse.json({ ok: true });

    const { data, error } = await admin
      .from("internal_activities")
      .update(endringer)
      .eq("id", id)
      .eq("company_id", session.companyId)
      .select("*")
      .maybeSingle();
    if (error) {
      if (erUnikBrot(error)) return NextResponse.json({ error: "Navnet finnes fra før." }, { status: 400 });
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: "Fant ikke aktiviteten" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
