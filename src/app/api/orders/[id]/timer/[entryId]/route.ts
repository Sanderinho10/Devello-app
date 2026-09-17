import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { dato, erAdmin, hentTimetype, ordreForSkriving, tal } from "@/lib/ordre/api";
import { supabaseAdmin, type SessionContext } from "@/lib/supabase/server";

/**
 * Endre eller slette én timeføring. Eieren eller en administrator.
 *
 * Eier-sjekken ligger her og ikke i RLS: skriving går med service role, og
 * det er API-et som vet hvem som spør.
 */
async function hentFoering(
  admin: ReturnType<typeof supabaseAdmin>,
  session: SessionContext,
  orderId: string,
  entryId: string,
) {
  const order = await ordreForSkriving(admin, session, orderId);
  if (order instanceof NextResponse) return order;

  const { data: entry } = await admin
    .from("time_entries")
    .select("*")
    .eq("id", entryId)
    .eq("order_id", order.id)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ error: "Fant ikke timeføringen" }, { status: 404 });
  }
  if (entry.invoice_draft_id) {
    return NextResponse.json(
      { error: "Timene er fakturert og kan ikke endres." },
      { status: 400 },
    );
  }
  if (entry.user_id !== session.userId && !(await erAdmin(admin, session))) {
    return NextResponse.json(
      { error: "Du kan bare endre dine egne timer." },
      { status: 403 },
    );
  }
  return entry;
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
    const entry = await hentFoering(admin, session, id, entryId);
    if (entry instanceof NextResponse) return entry;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const endringer: Record<string, unknown> = {};

    if (body.work_date !== undefined) {
      const d = dato(body.work_date);
      if (!d) return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
      endringer.work_date = d;
    }
    if (body.hours !== undefined) {
      const h = tal(body.hours);
      if (h === null || h <= 0 || h > 24) {
        return NextResponse.json({ error: "Timer må være mellom 0 og 24." }, { status: 400 });
      }
      endringer.hours = Math.round(h * 100) / 100;
    }
    if (body.note !== undefined) {
      endringer.note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    }
    if (body.billable !== undefined) endringer.billable = Boolean(body.billable);
    if (body.price_item_id !== undefined) {
      const t = await hentTimetype(admin, session.companyId, body.price_item_id);
      if (!t) return NextResponse.json({ error: "Ukjent timetype." }, { status: 400 });
      endringer.price_item_id = t.id;
      endringer.time_type_name = t.name;
      endringer.unit_price = t.unit_price;
    }

    if (Object.keys(endringer).length === 0) return NextResponse.json(entry);

    const { data, error } = await admin
      .from("time_entries")
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
    const entry = await hentFoering(admin, session, id, entryId);
    if (entry instanceof NextResponse) return entry;

    const { error } = await admin.from("time_entries").delete().eq("id", entry.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
