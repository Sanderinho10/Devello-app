import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { pogoClient } from "@/lib/regnskap/poweroffice";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Koplinga til regnskapssystemet. Bare administratorer.
 *
 * PUT tester nøkkelen mot Go før noe lagres — et token og én side
 * fakturaer. Feiler det, får brukeren den oversatte feilmeldingen og
 * ingenting er endret. DELETE kobler fra men beholder raden, så
 * fakturaene som alt er hentet fortsatt peker på noe.
 */
export async function PUT(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as {
      provider?: unknown;
      environment?: unknown;
      client_key?: unknown;
    };
    if (body.provider !== "poweroffice") {
      return NextResponse.json({ error: "Bare PowerOffice Go er støttet ennå." }, { status: 400 });
    }
    const environment = body.environment === "demo" ? "demo" : "production";
    const clientKey = typeof body.client_key === "string" ? body.client_key.trim() : "";
    if (!clientKey) {
      return NextResponse.json({ error: "Client key mangler." }, { status: 400 });
    }

    // Test før lagring: token + én side fakturaer.
    try {
      const pogo = pogoClient({ id: `test:${session.companyId}`, environment, client_key: clientKey });
      await pogo.token();
      await pogo.hentInngaaandeFakturaer({ pageNumber: 1, pageSize: 1 });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("accounting_connections")
      .upsert(
        {
          company_id: session.companyId,
          provider: "poweroffice",
          environment,
          client_key: clientKey,
          status: "aktiv",
          status_reason: null,
          created_by: session.userId,
        },
        { onConflict: "company_id,provider" },
      )
      .select("id, provider, environment, status")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, connection: data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const admin = supabaseAdmin();
    const { error } = await admin
      .from("accounting_connections")
      .update({ status: "kopla_fra", status_reason: null })
      .eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
