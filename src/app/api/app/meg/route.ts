import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { APP_API_VERSION, hentTimetypar } from "@/lib/app/lese";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hentAktivitetar } from "@/lib/timer/api";

/** Hvem er jeg, hvilket selskap, og hva kan jeg føre timer som. Første kall appen gjør etter innlogging. */
export async function GET() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const [{ data: user }, { data: company }, timetyper, aktivitetar, { data: lager }] = await Promise.all([
      admin.from("users").select("id, full_name, email, role").eq("id", session.userId).single(),
      admin.from("companies").select("id, name, materials_markup_pct").eq("id", session.companyId).single(),
      hentTimetypar(admin, session.companyId),
      // Interntid og biler (0068). Tomme lister før migrasjonen er kjørt.
      hentAktivitetar(admin, session.companyId).catch(() => []),
      admin
        .from("stock_locations")
        .select("id, location_no, name, kind, user_id")
        .eq("company_id", session.companyId)
        .eq("active", true)
        .order("location_no"),
    ]);
    if (!user || !company) return NextResponse.json({ error: "Fant ikke brukeren" }, { status: 404 });

    return NextResponse.json({
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      company: { id: company.id, name: company.name, materials_markup_pct: Number(company.materials_markup_pct ?? 25) },
      timetyper,
      interne_aktiviteter: aktivitetar.map((a) => ({ id: a.id, name: a.name })),
      lager: (lager ?? []).map((l) => ({ ...l, min: l.user_id === session.userId })),
      api_version: APP_API_VERSION,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
