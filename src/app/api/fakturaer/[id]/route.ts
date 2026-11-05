import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { redigerUtkast, utkastMedId } from "@/lib/faktura/handlingar";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * PATCH  — redigering: linjer, fakturatekst, Deres ref., fakturakunden og
 *          (uten ordre) tittelen. Se redigerUtkast.
 * DELETE — slett et utkast uten ordre. Et forslag på en ordre lages på nytt
 *          fra ordren i stedet, og en overført faktura ligger i Go.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await utkastMedId(admin, session, id);
    if (r instanceof NextResponse) return r;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return await redigerUtkast(admin, session, r, body);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await utkastMedId(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (r.draft.order_id) {
      return NextResponse.json({ error: "Fakturaen hører til en ordre. Lag et nytt forslag fra ordren i stedet." }, { status: 400 });
    }
    if (r.draft.status === "overfort") {
      return NextResponse.json({ error: "Fakturaen er overført til regnskapssystemet og kan ikke slettes her." }, { status: 400 });
    }
    const { error } = await admin.from("invoice_drafts").delete().eq("id", r.draft.id).eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
