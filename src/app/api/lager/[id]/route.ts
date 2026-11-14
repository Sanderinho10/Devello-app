import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentBehaldning, lagerForSkriving } from "@/lib/lager/api";
import { lagerverdi } from "@/lib/lager/behaldning";
import { erAdmin } from "@/lib/ordre/api";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Éin bil med det som ligg i han.
 *
 * GET er det «frå bil»-veljaren på ordren les, og det montørappen skal
 * lese: varene med mengde og siste innpris. PATCH endrar namn, montør og om
 * bilen er i bruk — ein bil blir aldri sletta, for historikken skal stå.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const lager = await lagerForSkriving(admin, session, id, { ogsaaInaktiv: true });
    if (lager instanceof NextResponse) return lager;

    const varer = await hentBehaldning(admin, session.companyId, lager.id);
    return NextResponse.json({ lager, varer, verdi: lagerverdi(varer) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const lager = await lagerForSkriving(admin, session, id, { ogsaaInaktiv: true });
    if (lager instanceof NextResponse) return lager;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan endre biler og lager." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const endringer: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Gi bilen et navn." }, { status: 400 });
      endringer.name = name;
    }
    if (body.kind !== undefined) endringer.kind = body.kind === "lager" ? "lager" : "bil";
    if (body.reg_no !== undefined) endringer.reg_no = tekst(body.reg_no);
    if (body.note !== undefined) endringer.note = tekst(body.note);
    if (body.active !== undefined) endringer.active = Boolean(body.active);
    if (body.user_id !== undefined) {
      if (typeof body.user_id === "string" && body.user_id) {
        const bruker = (await brukereISelskap(admin, session.companyId)).find((b) => b.id === body.user_id);
        if (!bruker) return NextResponse.json({ error: "Fant ikke montøren." }, { status: 400 });
        endringer.user_id = bruker.id;
      } else {
        endringer.user_id = null;
      }
    }
    if (Object.keys(endringer).length === 0) return NextResponse.json(lager);

    const { data, error } = await admin.from("stock_locations").update(endringer).eq("id", lager.id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

function tekst(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
