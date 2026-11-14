import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { dato, erAdmin, hentTimetype, tal } from "@/lib/ordre/api";
import { ordreErLaast } from "@/lib/ordre/hent";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin, type SessionContext } from "@/lib/supabase/server";
import { flytteEndringar, type Flyttemaal } from "@/lib/timer/api";
import type { TimeEntry } from "@/lib/types";

/**
 * Endre, flytte eller slette éi timeføring frå timeregisteret — same kva ho
 * heng på, ein ordre eller interntid.
 *
 * Eigaren eller ein administrator, som elles. Fakturerte timar er låste.
 *
 * Flytting: order_id flyttar føringa til ein annan ordre, og
 * internal_activity_id gjer ho til interntid. Ei føring på ein avslutta
 * ordre kan ikkje endrast der ho står — men ho kan flyttast bort, for det
 * er slik timar ført på feil ordre blir retta opp.
 */
async function hentFoering(admin: ReturnType<typeof supabaseAdmin>, session: SessionContext, entryId: string) {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data } = await admin
    .from("time_entries")
    .select("*, orders(id, order_no, status)")
    .eq("id", entryId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Fant ikke timeføringen" }, { status: 404 });

  const { orders, ...entry } = data as TimeEntry & { orders: { id: string; order_no: number; status: string } | null };
  if (entry.invoice_draft_id) {
    return NextResponse.json({ error: "Timene er fakturert og kan ikke endres." }, { status: 400 });
  }
  const admin_ = await erAdmin(admin, session);
  if (entry.user_id !== session.userId && !admin_) {
    return NextResponse.json({ error: "Du kan bare endre dine egne timer." }, { status: 403 });
  }
  const paaLaastOrdre = Boolean(orders && ordreErLaast({ status: orders.status as never }));
  return { entry: entry as TimeEntry, erAdmin: admin_, paaLaastOrdre, ordreNr: orders?.order_no ?? null };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { entryId } = await params;
    const admin = supabaseAdmin();
    const funn = await hentFoering(admin, session, entryId);
    if (funn instanceof NextResponse) return funn;
    const { entry } = funn;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    let endringer: Record<string, unknown> = {};

    // Kvar skal føringa stå etter dette?
    let maal: Flyttemaal | null = null;
    if (typeof body.internal_activity_id === "string" && body.internal_activity_id) {
      if (body.internal_activity_id !== entry.internal_activity_id) {
        maal = { type: "intern", activityId: body.internal_activity_id };
      }
    } else if (typeof body.order_id === "string" && body.order_id) {
      if (body.order_id !== entry.order_id) {
        maal = { type: "ordre", orderId: body.order_id, priceItemId: body.price_item_id ?? undefined };
      }
    }

    if (funn.paaLaastOrdre && !maal) {
      return NextResponse.json(
        { error: `Ordre #${funn.ordreNr} er avsluttet. Timene kan flyttes til en annen ordre, men ikke endres her.` },
        { status: 400 },
      );
    }

    if (maal) {
      const flytt = await flytteEndringar(admin, session.companyId, entry, maal);
      if ("feil" in flytt) return NextResponse.json({ error: flytt.feil }, { status: flytt.status });
      endringer = { ...flytt.endringar };
    }
    const blirIntern = maal ? maal.type === "intern" : !entry.order_id;

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
    // Interntid er aldri fakturerbar og har ingen timetype.
    if (!blirIntern) {
      if (body.billable !== undefined) endringer.billable = Boolean(body.billable);
      if (body.price_item_id !== undefined && endringer.price_item_id === undefined) {
        const t = await hentTimetype(admin, session.companyId, body.price_item_id);
        if (!t) return NextResponse.json({ error: "Ukjent timetype." }, { status: 400 });
        endringer.price_item_id = t.id;
        endringer.time_type_name = t.name;
        endringer.unit_price = t.unit_price;
      }
    }
    if (typeof body.user_id === "string" && body.user_id !== entry.user_id) {
      if (!funn.erAdmin) {
        return NextResponse.json({ error: "Bare administratorer kan føre timer for andre." }, { status: 403 });
      }
      const bruker = (await brukereISelskap(admin, session.companyId)).find((b) => b.id === body.user_id);
      if (!bruker) return NextResponse.json({ error: "Fant ikke montøren." }, { status: 400 });
      endringer.user_id = bruker.id;
    }

    if (Object.keys(endringer).length === 0) return NextResponse.json(entry);

    const { data, error } = await admin.from("time_entries").update(endringer).eq("id", entry.id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ entryId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { entryId } = await params;
    const admin = supabaseAdmin();
    const funn = await hentFoering(admin, session, entryId);
    if (funn instanceof NextResponse) return funn;
    if (funn.paaLaastOrdre) {
      return NextResponse.json(
        { error: `Ordre #${funn.ordreNr} er avsluttet. Timene kan ikke slettes.` },
        { status: 400 },
      );
    }

    const { error } = await admin.from("time_entries").delete().eq("id", funn.entry.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
