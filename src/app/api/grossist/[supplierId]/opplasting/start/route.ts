import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { BUCKET, paagaaandeJobb } from "@/lib/grossist/jobb";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Start opplasting: en jobb i kø (ikke startet) og signerte opplastings-
 * lenker rett til Storage. Filene er 50 MB+ og går aldri gjennom Next.
 * Body: { varefil_name, rabattfil_name? }.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const body = (await request.json().catch(() => ({}))) as { varefil_name?: unknown; rabattfil_name?: unknown };
    const varefilNamn = typeof body.varefil_name === "string" ? sanitize(body.varefil_name) : "";
    if (!varefilNamn) return NextResponse.json({ error: "Varefil mangler." }, { status: 400 });
    const rabattfilNamn = typeof body.rabattfil_name === "string" && body.rabattfil_name ? sanitize(body.rabattfil_name) : null;

    const lever = await paagaaandeJobb(admin, g.id);
    if (lever) return NextResponse.json({ error: "En import pågår allerede.", jobb: lever }, { status: 409 });

    // Jobben opprettes som «ferdig»-plassholder? Nei: som kø med et flagg i
    // stien — den starter først når klienten sier at opplastingen er ferdig.
    const { data: jobb, error } = await admin
      .from("import_jobs")
      .insert({
        company_id: session.companyId,
        supplier_id: g.id,
        source: "opplasting",
        status: "koe",
        varefil_name: varefilNamn,
        rabattfil_name: rabattfilNamn,
        created_by: session.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const base = `${session.companyId}/${g.id}/${jobb.id}`;
    const varefilPath = `${base}/${varefilNamn}`;
    const rabattfilPath = rabattfilNamn ? `${base}/${rabattfilNamn}` : null;
    const { data: v, error: vFeil } = await admin.storage.from(BUCKET).createSignedUploadUrl(varefilPath);
    if (vFeil || !v) throw new Error(`Kunne ikke lage opplastingslenke: ${vFeil?.message ?? "ukjent"}`);
    let rabatt: { path: string; token: string } | null = null;
    if (rabattfilPath) {
      const { data: r, error: rFeil } = await admin.storage.from(BUCKET).createSignedUploadUrl(rabattfilPath);
      if (rFeil || !r) throw new Error(`Kunne ikke lage opplastingslenke: ${rFeil?.message ?? "ukjent"}`);
      rabatt = { path: rabattfilPath, token: r.token };
    }
    await admin.from("import_jobs").update({ varefil_path: varefilPath, rabattfil_path: rabattfilPath }).eq("id", jobb.id);

    return NextResponse.json({
      jobId: jobb.id,
      bucket: BUCKET,
      varefil: { path: varefilPath, token: v.token },
      rabattfil: rabatt,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-æøåÆØÅ ]+/g, "_").trim().slice(0, 120);
}
