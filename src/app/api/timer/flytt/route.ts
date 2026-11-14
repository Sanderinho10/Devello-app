import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import { flytteEndringar, type Flyttemaal } from "@/lib/timer/api";
import type { TimeEntry } from "@/lib/types";

const MAKS = 500;

/**
 * Flyttar fleire timeføringar på éin gong — til ein annan ordre
 * ({ ids, order_id }) eller til interntid ({ ids, internal_activity_id }).
 * Berre administrator: dette er opprydding på tvers av montørar.
 *
 * Fakturerte timar blir ståande og talde opp i svaret. Resten flyttar, så
 * éi låst føring ikkje stoppar dei nitti andre. Skal interntid inn på ein
 * ordre, må price_item_id vere med — interntid har ingen timetype.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan flytte flere timer samtidig." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      ids?: unknown;
      order_id?: unknown;
      internal_activity_id?: unknown;
      price_item_id?: unknown;
    };
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((i): i is string => typeof i === "string"))] : [];
    if (ids.length === 0) return NextResponse.json({ error: "Velg timene som skal flyttes." }, { status: 400 });
    if (ids.length > MAKS) {
      return NextResponse.json({ error: `Flytt høyst ${MAKS} føringer om gangen.` }, { status: 400 });
    }

    let maal: Flyttemaal;
    if (typeof body.internal_activity_id === "string" && body.internal_activity_id) {
      maal = { type: "intern", activityId: body.internal_activity_id };
    } else if (typeof body.order_id === "string" && body.order_id) {
      maal = { type: "ordre", orderId: body.order_id, priceItemId: body.price_item_id || undefined };
    } else {
      return NextResponse.json({ error: "Velg hvor timene skal flyttes." }, { status: 400 });
    }

    const { data: rader, error } = await admin
      .from("time_entries")
      .select("*")
      .eq("company_id", session.companyId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    const foeringar = (rader ?? []) as TimeEntry[];

    let flytta = 0;
    let fakturert = 0;
    let alleredeDer = 0;
    for (const entry of foeringar) {
      if (entry.invoice_draft_id) {
        fakturert += 1;
        continue;
      }
      const derFraFoer =
        maal.type === "ordre" ? entry.order_id === maal.orderId : entry.internal_activity_id === maal.activityId;
      if (derFraFoer) {
        alleredeDer += 1;
        continue;
      }
      // Timetypen i kallet gjeld berre føringane som kjem frå interntid. Dei
      // som alt står på ein ordre tek med seg timetypen og prisen dei har.
      const tilDenne: Flyttemaal =
        maal.type === "ordre" && entry.order_id ? { type: "ordre", orderId: maal.orderId } : maal;
      const flytt = await flytteEndringar(admin, session.companyId, entry, tilDenne);
      // Feil ved målet (ukjend ordre, manglande timetype) gjeld alle: stopp med éin gong.
      if ("feil" in flytt) {
        return NextResponse.json({ error: flytt.feil, flytta }, { status: flytt.status });
      }
      const { error: feil } = await admin.from("time_entries").update(flytt.endringar).eq("id", entry.id);
      if (feil) throw new Error(feil.message);
      flytta += 1;
    }

    return NextResponse.json({ ok: true, flytta, fakturert, allerede_der: alleredeDer });
  } catch (err) {
    return errorResponse(err);
  }
}
