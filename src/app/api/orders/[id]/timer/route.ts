import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { dato, erAdmin, erUnikBrot, finstMedClientId, hentTimetype, ordreForSkriving, tal, uuid } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Fører timer på en ordre.
 *
 * Timetypen kommer fra selskapets timeprisliste, og navn og pris kopieres
 * inn på føringen: prislista kan endre seg, føringen skal ikke. Montøren er
 * den innloggede — bare en administrator kan føre på vegne av andre.
 *
 * Montørappen sender client_id (UUID laget i appen). Samme client_id igjen
 * → 200 med raden som alt finnes, selv om ordren i mellomtida er
 * avsluttet: appen sender kanskje om igjen etter en natt uten dekning.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      work_date?: unknown;
      price_item_id?: unknown;
      hours?: unknown;
      note?: unknown;
      user_id?: unknown;
      client_id?: unknown;
    };

    const clientId = uuid(body.client_id);
    if (clientId) {
      const avvist = await ordreModulEllers403(admin, session.companyId);
      if (avvist) return avvist;
      const finst = await finstMedClientId<{ order_id: string }>(admin, "time_entries", session.companyId, clientId);
      if (finst && finst.order_id === id) return NextResponse.json(finst, { status: 200 });
    }

    const order = await ordreForSkriving(admin, session, id);
    if (order instanceof NextResponse) return order;

    const workDate = dato(body.work_date);
    if (!workDate) {
      return NextResponse.json({ error: "Datoen mangler eller er ugyldig." }, { status: 400 });
    }
    const hours = tal(body.hours);
    if (hours === null || hours <= 0 || hours > 24) {
      return NextResponse.json({ error: "Timer må være mellom 0 og 24." }, { status: 400 });
    }

    const timetype = await hentTimetype(admin, session.companyId, body.price_item_id);
    if (!timetype) {
      return NextResponse.json(
        { error: "Velg en timetype fra timeprislisten." },
        { status: 400 },
      );
    }

    // Andres timer krever admin. Ellers er det alltid en selv — også om
    // body-en påstår noe annet.
    let userId = session.userId;
    if (typeof body.user_id === "string" && body.user_id !== session.userId) {
      if (!(await erAdmin(admin, session))) {
        return NextResponse.json(
          { error: "Bare administratorer kan føre timer for andre." },
          { status: 403 },
        );
      }
      const { data: bruker } = await admin
        .from("users")
        .select("id")
        .eq("id", body.user_id)
        .eq("company_id", session.companyId)
        .maybeSingle();
      if (!bruker) {
        return NextResponse.json({ error: "Fant ikke montøren." }, { status: 400 });
      }
      userId = bruker.id;
    }

    const { data, error } = await admin
      .from("time_entries")
      .insert({
        company_id: session.companyId,
        order_id: order.id,
        user_id: userId,
        work_date: workDate,
        price_item_id: timetype.id,
        time_type_name: timetype.name,
        unit_price: timetype.unit_price,
        hours: Math.round(hours * 100) / 100,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        created_by: session.userId,
        client_id: clientId,
      })
      .select("*")
      .single();
    if (error) {
      // To samtidige kall med samme client_id: den andre finner raden.
      if (erUnikBrot(error) && clientId) {
        const finst = await finstMedClientId(admin, "time_entries", session.companyId, clientId);
        if (finst) return NextResponse.json(finst, { status: 200 });
      }
      throw new Error(error.message);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
