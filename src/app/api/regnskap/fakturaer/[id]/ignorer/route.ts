import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { fakturaForSkriving } from "@/lib/regnskap/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Fakturaer som ikke hører til noen ordre: verkstedleie, drivstoff. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const faktura = await fakturaForSkriving(admin, session, id);
    if (faktura instanceof NextResponse) return faktura;

    if (faktura.matched_line_count > 0 || faktura.order_id) {
      return NextResponse.json(
        { error: "Løs linjene fra ordren før du ignorerer fakturaen." },
        { status: 400 },
      );
    }
    const { error } = await admin
      .from("supplier_invoices")
      .update({ match_status: "ignorert" })
      .eq("id", faktura.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
