import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Sletter et notat — eget, eller som administrator. Bilder knyttet til
 * notatet blir stående som vanlige dokumenter på ordren (note_id → null).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, noteId } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const { data: notat } = await admin
      .from("order_notes")
      .select("id, user_id")
      .eq("id", noteId)
      .eq("order_id", id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!notat) return NextResponse.json({ error: "Fant ikke notatet" }, { status: 404 });
    if (notat.user_id !== session.userId && !(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Du kan bare slette dine egne notater." }, { status: 403 });
    }

    const { error } = await admin.from("order_notes").delete().eq("id", notat.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
