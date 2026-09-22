import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Kobler fra Boligmappa: tokens slettes. Plant-cachen og sendte dokumenter står. */
export async function DELETE() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;
  try {
    const { error } = await supabaseAdmin().from("boligmappa_connections").delete().eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
