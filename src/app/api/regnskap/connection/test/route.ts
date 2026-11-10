import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { pogoClient } from "@/lib/regnskap/poweroffice";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * «Test tilkobling» i Innstillinger → Regnskap.
 *
 * Samme prøve som når nøkkelen legges inn: et token og én side fakturaer.
 * Ingenting hentes og ingenting lagres på ordrene — henting hører hjemme
 * under Register → Leverandørfakturaer, der fakturaene ligger. Resultatet
 * skrives på koplinga, så en kopling som står med «Feil» etter en natt
 * uten nøkler går tilbake til «Tilkoblet» når nøklene er på plass.
 */
export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const { data: kopling } = await admin
      .from("accounting_connections")
      .select("id, provider, environment, client_key, status")
      .eq("company_id", session.companyId)
      .eq("provider", "poweroffice")
      .neq("status", "kopla_fra")
      .maybeSingle();

    if (!kopling) {
      return NextResponse.json({ error: "Ingen regnskapssystem er koblet til." }, { status: 400 });
    }

    try {
      const pogo = pogoClient({ id: kopling.id, environment: kopling.environment, client_key: kopling.client_key });
      await pogo.token();
      await pogo.hentInngaaandeFakturaer({ pageNumber: 1, pageSize: 1 });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      await admin
        .from("accounting_connections")
        .update({ status: "feil", status_reason: m })
        .eq("id", kopling.id);
      return NextResponse.json({ ok: false, error: m }, { status: 400 });
    }

    if (kopling.status !== "aktiv") {
      await admin
        .from("accounting_connections")
        .update({ status: "aktiv", status_reason: null })
        .eq("id", kopling.id);
    }
    return NextResponse.json({ ok: true, melding: "Tilkoblingen virker." });
  } catch (err) {
    return errorResponse(err);
  }
}
