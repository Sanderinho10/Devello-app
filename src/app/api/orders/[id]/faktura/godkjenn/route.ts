import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Godkjenner forslaget: et menneske har sett over. Angres med /angre-godkjenning. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    if (r.draft.status === "overfort") {
      return NextResponse.json({ error: "Forslaget er allerede overført." }, { status: 400 });
    }
    if (!r.draft.lines.some((l) => l.included && l.unit_price !== null)) {
      return NextResponse.json({ error: "Forslaget har ingen linjer med beløp." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("invoice_drafts")
      .update({ status: "godkjent", approved_by: session.userId, approved_at: new Date().toISOString(), transfer_error: null })
      .eq("id", r.draft.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
