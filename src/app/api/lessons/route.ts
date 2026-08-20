import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Godkjenn eller avvis en lærdom.
 *
 * Bare administratorer. En aktiv lærdom går inn i hvert eneste tilbud selskapet
 * lager etterpå, og det er ikke en avgjørelse som hører hjemme hos den som
 * tilfeldigvis satt med musa.
 *
 * Alle spørringer er avgrenset til sesjonens selskap. Lærdommene til én kunde
 * skal aldri kunne røres — eller leses — av en annen.
 */
export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const body = (await request.json()) as { id?: string; status?: string };
    const id = (body.id ?? "").trim();
    const status = body.status;

    if (!id || (status !== "aktiv" && status !== "avvist" && status !== "foreslaatt")) {
      return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from("agent_lessons")
      .update({
        status,
        decided_at: new Date().toISOString(),
        decided_by: session.userId,
      })
      .eq("id", id)
      // Tenant-avgrensningen ligger i spørringen, ikke i en etterkontroll.
      .eq("company_id", session.companyId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id." }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("agent_lessons")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return errorResponse(new Error(error.message));
  return NextResponse.json({ ok: true });
}
