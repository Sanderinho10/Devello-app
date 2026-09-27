import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { BUCKET, startIBakgrunnen } from "@/lib/grossist/jobb";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Opplastingen er ferdig: sjekk at fila ligger der, og start jobben. Body: { jobId }. */
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

    const body = (await request.json().catch(() => ({}))) as { jobId?: unknown };
    if (typeof body.jobId !== "string") return NextResponse.json({ error: "jobId mangler." }, { status: 400 });
    const { data: jobb } = await admin
      .from("import_jobs")
      .select("*")
      .eq("id", body.jobId)
      .eq("supplier_id", g.id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!jobb) return NextResponse.json({ error: "Fant ikke jobben." }, { status: 404 });
    if (jobb.status !== "koe" || !jobb.varefil_path) return NextResponse.json(jobb);

    // Fila må faktisk ligge der før vi starter.
    const mappe = jobb.varefil_path.split("/").slice(0, -1).join("/");
    const { data: filer } = await admin.storage.from(BUCKET).list(mappe);
    const namn = new Set((filer ?? []).map((f) => f.name));
    if (!namn.has(jobb.varefil_path.split("/").pop()!)) {
      return NextResponse.json({ error: "Varefila ble ikke lastet opp. Prøv igjen." }, { status: 400 });
    }
    startIBakgrunnen(admin, jobb.id);
    return NextResponse.json(jobb);
  } catch (err) {
    return errorResponse(err);
  }
}
