import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { registrerAppBrukar } from "@/lib/billing/subscription";
import { erUnikBrot, finstMedClientId, ordreForSkriving, uuid } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

const MAKS_TEKST = 4000;

/**
 * Nytt notat på ordren — fritekst fra montøren, gjerne med bilder knyttet
 * til etterpå (POST …/dokumenter med note_id). Samme client_id igjen → 200
 * med notatet som alt finnes.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as { text?: unknown; client_id?: unknown };

    const clientId = uuid(body.client_id);
    if (clientId) {
      const avvist = await ordreModulEllers403(admin, session.companyId);
      if (avvist) return avvist;
      const finst = await finstMedClientId<{ order_id: string }>(admin, "order_notes", session.companyId, clientId);
      if (finst && finst.order_id === id) return NextResponse.json(finst, { status: 200 });
    }

    const order = await ordreForSkriving(admin, session, id);
    if (order instanceof NextResponse) return order;

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Notatet er tomt." }, { status: 400 });
    if (text.length > MAKS_TEKST) return NextResponse.json({ error: `Notatet kan ha høyst ${MAKS_TEKST} tegn.` }, { status: 400 });

    const { data, error } = await admin
      .from("order_notes")
      .insert({ company_id: session.companyId, order_id: order.id, user_id: session.userId, text, client_id: clientId })
      .select("*")
      .single();
    if (error) {
      if (erUnikBrot(error) && clientId) {
        const finst = await finstMedClientId(admin, "order_notes", session.companyId, clientId);
        if (finst) return NextResponse.json(finst, { status: 200 });
      }
      throw new Error(error.message);
    }
    // Aktiv montør i appen: telles første gang i måneden, bare fra appen.
    if (session.via === "bearer") await registrerAppBrukar(admin, { companyId: session.companyId, userId: session.userId });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
