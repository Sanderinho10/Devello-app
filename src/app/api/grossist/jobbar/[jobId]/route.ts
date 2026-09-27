import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Status og framdrift for polling. Bare selskapets egne jobber. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  try {
    const { jobId } = await params;
    const { data } = await supabaseAdmin()
      .from("import_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Fant ikke jobben." }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
