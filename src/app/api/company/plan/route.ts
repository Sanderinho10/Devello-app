import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { findPlan } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Registrerer pakkevalget.
 *
 * Ingen betaling er koblet på: dette skriver valget på selskapet og ikke noe
 * mer. Kommer det en betalingsleverandør, er det her den hektes inn.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const body = (await request.json()) as { plan?: string };
    const plan = findPlan(body.plan ?? null);
    if (!plan) {
      return NextResponse.json({ error: "Ukjent pakke." }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from("companies")
      .update({ plan: plan.id })
      .eq("id", session.companyId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, plan: plan.id });
  } catch (err) {
    return errorResponse(err);
  }
}
