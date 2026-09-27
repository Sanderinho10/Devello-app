import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { grossistForSkriving } from "@/lib/grossist/api";
import { paagaaandeJobb, startIBakgrunnen } from "@/lib/grossist/jobb";
import { supabaseAdmin } from "@/lib/supabase/server";

/** «Hent nå»: ny importjobb fra FTP, startet i bakgrunnen. 409 om en jobb lever. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const { data: ftp } = await admin.from("supplier_ftp").select("supplier_id").eq("supplier_id", g.id).maybeSingle();
    if (!ftp) return NextResponse.json({ error: "Lagre FTP-oppsettet først." }, { status: 400 });

    const lever = await paagaaandeJobb(admin, g.id);
    if (lever) return NextResponse.json({ error: "En import pågår allerede.", jobb: lever }, { status: 409 });

    const { data: jobb, error } = await admin
      .from("import_jobs")
      .insert({ company_id: session.companyId, supplier_id: g.id, source: "ftp", created_by: session.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    startIBakgrunnen(admin, jobb.id);
    return NextResponse.json(jobb);
  } catch (err) {
    return errorResponse(err);
  }
}
