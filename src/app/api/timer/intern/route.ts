import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { registrerAppBrukar } from "@/lib/billing/subscription";
import { dato, erAdmin, erUnikBrot, finstMedClientId, tal, uuid } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hentAktivitet } from "@/lib/timer/api";

/**
 * Fører interntid: timar som ikkje høyrer til nokon ordre.
 *
 * Same reglar som timar på ein ordre (api/orders/[id]/timer): montøren er
 * den innlogga, berre ein administrator fører for andre, og montørappen kan
 * sende client_id så same føring sendt to gonger blir éi rad.
 *
 * Det som skil: aktiviteten kjem frå lista over interne aktivitetar, prisen
 * er 0, og føringa er ikkje fakturerbar. Ho kjem aldri på ei faktura.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as {
      work_date?: unknown;
      internal_activity_id?: unknown;
      hours?: unknown;
      note?: unknown;
      user_id?: unknown;
      client_id?: unknown;
    };

    const clientId = uuid(body.client_id);
    if (clientId) {
      const finst = await finstMedClientId(admin, "time_entries", session.companyId, clientId);
      if (finst) return NextResponse.json(finst, { status: 200 });
    }

    const workDate = dato(body.work_date);
    if (!workDate) {
      return NextResponse.json({ error: "Datoen mangler eller er ugyldig." }, { status: 400 });
    }
    const hours = tal(body.hours);
    if (hours === null || hours <= 0 || hours > 24) {
      return NextResponse.json({ error: "Timer må være mellom 0 og 24." }, { status: 400 });
    }
    const aktivitet = await hentAktivitet(admin, session.companyId, body.internal_activity_id);
    if (!aktivitet) {
      return NextResponse.json({ error: "Velg hva interntiden gjelder." }, { status: 400 });
    }

    let userId = session.userId;
    if (typeof body.user_id === "string" && body.user_id !== session.userId) {
      if (!(await erAdmin(admin, session))) {
        return NextResponse.json({ error: "Bare administratorer kan føre timer for andre." }, { status: 403 });
      }
      const bruker = (await brukereISelskap(admin, session.companyId)).find((b) => b.id === body.user_id);
      if (!bruker) return NextResponse.json({ error: "Fant ikke montøren." }, { status: 400 });
      userId = bruker.id;
    }

    const { data, error } = await admin
      .from("time_entries")
      .insert({
        company_id: session.companyId,
        order_id: null,
        internal_activity_id: aktivitet.id,
        user_id: userId,
        work_date: workDate,
        price_item_id: null,
        time_type_name: aktivitet.name,
        unit_price: 0,
        hours: Math.round(hours * 100) / 100,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        billable: false,
        created_by: session.userId,
        client_id: clientId,
      })
      .select("*")
      .single();
    if (error) {
      if (erUnikBrot(error) && clientId) {
        const finst = await finstMedClientId(admin, "time_entries", session.companyId, clientId);
        if (finst) return NextResponse.json(finst, { status: 200 });
      }
      throw new Error(error.message);
    }

    if (session.via === "bearer") await registrerAppBrukar(admin, { companyId: session.companyId, userId: session.userId });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
