import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { develloAdminEllers403 } from "@/lib/devello-admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { lesFakturaFelt } from "../felt";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Endre en abonnementsfaktura: `{ betalt: true | false }` markerer betalt
 * eller angrer, og nummer, beløp og forfall kan rettes. Bare for Devello.
 *
 * Betalt nå → selskapet får tilgangen tilbake med det samme; sperren og
 * varselet leses ved hver forespørsel (lib/billing/tilgang.ts).
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;
  const nei = develloAdminEllers403(session);
  if (nei) return nei;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const lest = lesFakturaFelt(body, false);
    if ("feil" in lest) return NextResponse.json({ error: lest.feil }, { status: 400 });
    const felt = { ...lest.felt };
    if (body.betalt === true) felt.betalt_at = new Date().toISOString();
    if (body.betalt === false) felt.betalt_at = null;
    if (Object.keys(felt).length === 0) return NextResponse.json({ error: "Ingenting å endre." }, { status: 400 });

    const { data, error } = await supabaseAdmin().from("devello_fakturaer").update(felt).eq("id", id).select("*").maybeSingle();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Fakturanummeret finnes fra før for selskapet." }, { status: 409 });
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: "Fant ikke fakturaen." }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;
  const nei = develloAdminEllers403(session);
  if (nei) return nei;

  try {
    const { id } = await params;
    const { error } = await supabaseAdmin().from("devello_fakturaer").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
