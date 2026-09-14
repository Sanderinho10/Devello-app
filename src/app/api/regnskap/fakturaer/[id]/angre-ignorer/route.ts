import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { fakturaForSkriving } from "@/lib/regnskap/api";
import { oppdaterFakturaStatus } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";

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

    await admin.from("supplier_invoices").update({ match_status: "ukopla" }).eq("id", faktura.id);
    const status = await oppdaterFakturaStatus(admin, faktura.id);
    return NextResponse.json({ ok: true, match_status: status });
  } catch (err) {
    return errorResponse(err);
  }
}
