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

    // Hundre om gongen: fem hundre id-ar i éi adresse er for langt for porten.
    const foeringar: TimeEntry[] = [];
    for (const bolk of bolkar(ids)) {
      const { data: rader, error } = await admin
        .from("time_entries")
        .select("*")
        .eq("company_id", session.companyId)
        .in("id", bolk);
      if (error) throw new Error(error.message);
      foeringar.push(...((rader ?? []) as TimeEntry[]));
    }

    const fakturert = foeringar.filter((e) => e.invoice_draft_id).length;
    const aktuelle = foeringar.filter((e) => !e.invoice_draft_id);
    const derFraFoer = (e: TimeEntry) =>
      maal.type === "ordre" ? e.order_id === maal.orderId : e.internal_activity_id === maal.activityId;
    const alleredeDer = aktuelle.filter(derFraFoer).length;
    const skalFlyttast = aktuelle.filter((e) => !derFraFoer(e));

    // Målet blir slått opp éin gong per slag, og alt blir sjekka før noko
    // blir skrive — så ein manglande timetype ikkje gir ei halv flytting.
    // Timetypen i kallet gjeld berre føringane som kjem frå interntid. Dei
    // som alt står på ein ordre tek med seg timetypen og prisen dei har.
    const grupper: { ids: string[]; endringar: Record<string, unknown> }[] = [];
    const fraOrdre = skalFlyttast.filter((e) => e.order_id);
    const fraIntern = skalFlyttast.filter((e) => !e.order_id);
    for (const [gruppe, tilDenne] of [
      [fraOrdre, maal.type === "ordre" ? ({ type: "ordre", orderId: maal.orderId } as Flyttemaal) : maal],
      [fraIntern, maal],
    ] as [TimeEntry[], Flyttemaal][]) {
      if (gruppe.length === 0) continue;
      const flytt = await flytteEndringar(admin, session.companyId, gruppe[0], tilDenne);
      if ("feil" in flytt) return NextResponse.json({ error: flytt.feil }, { status: flytt.status });
      grupper.push({ ids: gruppe.map((e) => e.id), endringar: flytt.endringar });
    }

    let flytta = 0;
    for (const gruppe of grupper) {
      for (const bolk of bolkar(gruppe.ids)) {
        const { error: feil } = await admin
          .from("time_entries")
          .update(gruppe.endringar)
          .eq("company_id", session.companyId)
          .is("invoice_draft_id", null)
          .in("id", bolk);
        if (feil) throw new Error(feil.message);
        flytta += bolk.length;
      }
    }

    return NextResponse.json({ ok: true, flytta, fakturert, allerede_der: alleredeDer });
  } catch (err) {
    return errorResponse(err);
  }
}

function bolkar<T>(liste: T[], storleik = 100): T[][] {
  const ut: T[][] = [];
  for (let i = 0; i < liste.length; i += storleik) ut.push(liste.slice(i, i + storleik));
  return ut;
}
