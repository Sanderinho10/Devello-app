import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { overforTilRegnskap } from "@/lib/faktura/overfor";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Overfør det godkjente forslaget til regnskapssystemet som ordreutkast.
 *
 * Body: { createCustomer?: boolean, customerNo?: string }. Svarer 409 med
 * { needsCustomer, foreslaatt } når kunden må opprettes, og 409 med
 * { kandidatar } når flere passer — UI-et spør og kaller på nytt.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    if (r.draft.status === "overfort") {
      return NextResponse.json({ error: "Forslaget er allerede overført.", draft: r.draft }, { status: 400 });
    }
    if (r.draft.status !== "godkjent" && r.draft.status !== "feil") {
      return NextResponse.json({ error: "Godkjenn forslaget først." }, { status: 400 });
    }
    if (r.ordre.status !== "paagaar" && r.ordre.status !== "ferdig") {
      return NextResponse.json({ error: "Ordren må være i gang eller ferdig for å faktureres." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { createCustomer?: unknown; customerNo?: unknown };
    const resultat = await overforTilRegnskap(admin, {
      draft: r.draft,
      ordre: r.ordre,
      userId: session.userId,
      createCustomer: body.createCustomer === true,
      customerNo: typeof body.customerNo === "string" ? body.customerNo : null,
    });

    if (resultat.ok) return NextResponse.json(resultat);
    const { ok: _ok, status, ...rest } = resultat;
    void _ok;
    return NextResponse.json(rest, { status });
  } catch (err) {
    return errorResponse(err);
  }
}
