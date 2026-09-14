import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreForSkriving, tal } from "@/lib/ordre/api";
import { paaslagFraSalspris, round2, salspris } from "@/lib/ordre/summering";
import { supabaseAdmin, type SessionContext } from "@/lib/supabase/server";
import type { MaterialEntry } from "@/lib/types";

/**
 * Endre eller slette én materiellinje.
 *
 * Regnskapet på linja skal alltid gå opp: sale_price = cost_price × (1 +
 * markup_pct/100) når kostprisen er kjent. Derfor:
 *
 * - Nytt påslag → salgsprisen regnes om.
 * - Ny salgspris → påslaget settes til det som svarer, så ingen senere
 *   leser et påslag på 25 % ved siden av en pris som er noe annet. Uten
 *   kostpris (fritekst) står påslaget som det var; det er uansett bare
 *   informasjon der.
 */
async function hentLinje(
  admin: ReturnType<typeof supabaseAdmin>,
  session: SessionContext,
  orderId: string,
  entryId: string,
) {
  const order = await ordreForSkriving(admin, session, orderId);
  if (order instanceof NextResponse) return order;

  const { data: entry } = await admin
    .from("material_entries")
    .select("*")
    .eq("id", entryId)
    .eq("order_id", order.id)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ error: "Fant ikke materiellinjen" }, { status: 404 });
  }
  return entry as MaterialEntry;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, entryId } = await params;
    const admin = supabaseAdmin();
    const entry = await hentLinje(admin, session, id, entryId);
    if (entry instanceof NextResponse) return entry;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const endringer: Record<string, unknown> = {};
    const kost = entry.cost_price === null ? null : Number(entry.cost_price);

    // En linje fra en leverandørfaktura er fakturaens tall: mengde og
    // kostpris kan ikke endres her. Påslag og fakturerbar kan.
    if (entry.invoice_line_id && body.quantity !== undefined) {
      return NextResponse.json(
        { error: "Mengden kommer fra leverandørfakturaen og kan ikke endres." },
        { status: 400 },
      );
    }

    if (body.quantity !== undefined) {
      const q = tal(body.quantity);
      if (q === null || q <= 0) {
        return NextResponse.json({ error: "Mengden må være større enn 0." }, { status: 400 });
      }
      endringer.quantity = Math.round(q * 1000) / 1000;
    }
    if (body.markup_pct !== undefined) {
      const p = tal(body.markup_pct);
      if (p === null || p < -100 || p > 1000) {
        return NextResponse.json({ error: "Påslaget er utenfor rimelig område." }, { status: 400 });
      }
      endringer.markup_pct = round2(p);
      if (kost !== null) endringer.sale_price = salspris(kost, p);
    }
    if (body.sale_price !== undefined) {
      const s = tal(body.sale_price);
      if (s === null || s < 0) {
        return NextResponse.json({ error: "Ugyldig salgspris." }, { status: 400 });
      }
      endringer.sale_price = round2(s);
      if (kost !== null && kost > 0) endringer.markup_pct = paaslagFraSalspris(kost, s);
    }
    if (body.note !== undefined) {
      endringer.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    }
    if (body.billable !== undefined) endringer.billable = Boolean(body.billable);

    if (Object.keys(endringer).length === 0) return NextResponse.json(entry);

    const { data, error } = await admin
      .from("material_entries")
      .update(endringer)
      .eq("id", entry.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, entryId } = await params;
    const admin = supabaseAdmin();
    const entry = await hentLinje(admin, session, id, entryId);
    if (entry instanceof NextResponse) return entry;

    if (entry.invoice_line_id) {
      return NextResponse.json(
        { error: "Linjen kommer fra en leverandørfaktura. Bruk «Løs fra ordre» i stedet." },
        { status: 400 },
      );
    }

    const { error } = await admin.from("material_entries").delete().eq("id", entry.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
