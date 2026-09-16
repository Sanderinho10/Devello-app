import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { fakturaForSkriving } from "@/lib/regnskap/api";
import { loysLinje, oppdaterFakturaStatus } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SupplierInvoiceLine } from "@/lib/types";

/** Løser én linje ({ line_id }) eller alle ({}) fra ordren. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const faktura = await fakturaForSkriving(admin, session, id);
    if (faktura instanceof NextResponse) return faktura;

    const body = (await request.json().catch(() => ({}))) as { line_id?: unknown };

    let sporring = admin
      .from("supplier_invoice_lines")
      .select("*")
      .eq("invoice_id", faktura.id)
      .eq("company_id", session.companyId)
      .eq("status", "kopla");
    if (typeof body.line_id === "string") sporring = sporring.eq("id", body.line_id);

    const { data: linjer } = await sporring;
    for (const linje of (linjer ?? []) as SupplierInvoiceLine[]) {
      await loysLinje(admin, linje);
    }
    // Hele fakturaen: også en kobling på hodenivå (faktura uten linjer) løses.
    if (typeof body.line_id !== "string") {
      await admin.from("supplier_invoices").update({ order_id: null }).eq("id", faktura.id);
    }
    const status = await oppdaterFakturaStatus(admin, faktura.id);
    return NextResponse.json({ ok: true, loyst: (linjer ?? []).length, match_status: status });
  } catch (err) {
    return errorResponse(err);
  }
}
