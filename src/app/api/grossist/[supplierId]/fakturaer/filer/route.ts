import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { grossistForSkriving } from "@/lib/grossist/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** De siste fakturafilene hentet for grossisten, med status og feil. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ supplierId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { supplierId } = await params;
    const admin = supabaseAdmin();
    const g = await grossistForSkriving(admin, session, supplierId);
    if (g instanceof NextResponse) return g;

    const limitRaa = Number(request.nextUrl.searchParams.get("limit") ?? "30");
    const limit = Number.isInteger(limitRaa) && limitRaa > 0 ? Math.min(limitRaa, 200) : 30;
    const { data, error } = await admin
      .from("supplier_invoice_files")
      .select("*")
      .eq("supplier_id", g.id)
      .eq("company_id", session.companyId)
      .order("fetched_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return NextResponse.json({ filer: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}
