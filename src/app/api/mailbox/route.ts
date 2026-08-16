import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Startpunktet for første henting.
 *
 * Kan bare settes før første henting. Etterpå styrer last_synced_at hvor
 * hentingen står, og å flytte startpunktet ville ikke gjort annet enn å
 * villede: e-post som alt er hentet, kommer ikke inn på nytt.
 */
export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json()) as { initial_fetch_from?: string };
    const dato = (body.initial_fetch_from ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) {
      return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
    }

    // Fra midnatt norsk tid den dagen, ikke midnatt UTC — velger noen «i dag»,
    // mener de i dag her.
    const fra = new Date(`${dato}T00:00:00+02:00`);
    if (Number.isNaN(fra.getTime())) {
      return NextResponse.json({ error: "Ugyldig dato." }, { status: 400 });
    }
    if (fra.getTime() > Date.now()) {
      return NextResponse.json(
        { error: "Datoen kan ikke være fram i tid." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: mailbox } = await admin
      .from("mailbox_connections")
      .select("id, last_synced_at")
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (!mailbox) {
      return NextResponse.json(
        { error: "Ingen postkasse tilkoblet." },
        { status: 400 },
      );
    }
    if (mailbox.last_synced_at) {
      return NextResponse.json(
        { error: "Første henting er alt gjort — startpunktet kan ikke flyttes." },
        { status: 400 },
      );
    }

    const { error } = await admin
      .from("mailbox_connections")
      .update({ initial_fetch_from: fra.toISOString() })
      .eq("id", mailbox.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
