import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Innstillinger som hører til ordremodulen.
 *
 * Skriver bare materials_markup_pct. Navn, adresse og målform eies av
 * /api/company, tone og postkasse av /api/settings — to skjemaer skal aldri
 * eie samme felt, ellers trekker det ene tilbake det det andre lagret.
 */
export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as { materials_markup_pct?: unknown };
    const pct = Number(body.materials_markup_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 500) {
      return NextResponse.json(
        { error: "Påslaget må være et tall mellom 0 og 500 prosent." },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("companies")
      .update({ materials_markup_pct: Math.round(pct * 100) / 100 })
      .eq("id", session.companyId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, materials_markup_pct: Math.round(pct * 100) / 100 });
  } catch (err) {
    return errorResponse(err);
  }
}
