import { NextResponse, after, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentForVarsel, lagreDeltakarar, lesHendingInput, sjekkTilhoyrsle } from "@/lib/kalender/hent";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { varsleKalenderendring } from "@/lib/varsel/send";

type Admin = ReturnType<typeof supabaseAdmin>;

/** Modul, rolle og at avtalen er selskapet sin. Gir eit ferdig svar når noko manglar. */
async function sjekk(admin: Admin, session: SessionContext, id: string): Promise<NextResponse | null> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;
  if (!(await erAdmin(admin, session))) {
    return NextResponse.json({ error: "Bare administratorer kan endre kalenderen." }, { status: 403 });
  }
  const { data } = await admin
    .from("calendar_events")
    .select("id")
    .eq("id", id)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Fant ikke avtalen." }, { status: 404 });
  return null;
}

/** Endre ein avtale. Heile avtalen blir send, som frå skjemaet. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await sjekk(admin, session, id);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = lesHendingInput(body);
    if ("feil" in input) return NextResponse.json({ error: input.feil }, { status: 400 });
    const tilhoyrsle = await sjekkTilhoyrsle(admin, session.companyId, input);
    if ("feil" in tilhoyrsle) return NextResponse.json({ error: tilhoyrsle.feil }, { status: 400 });

    const foer = await hentForVarsel(admin, session.companyId, id);
    const { deltakarar, ...rad } = input;
    const { error } = await admin
      .from("calendar_events")
      .update(rad)
      .eq("id", id)
      .eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    await lagreDeltakarar(admin, session.companyId, id, deltakarar);

    after(async () => {
      const etter = await hentForVarsel(admin, session.companyId, id);
      await varsleKalenderendring(admin, { companyId: session.companyId, avsenderId: session.userId, eventId: id, foer, etter });
    });

    return NextResponse.json({ id });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await sjekk(admin, session, id);
    if (avvist) return avvist;

    const foer = await hentForVarsel(admin, session.companyId, id);
    const { error } = await admin.from("calendar_events").delete().eq("id", id).eq("company_id", session.companyId);
    if (error) throw new Error(error.message);
    after(() => varsleKalenderendring(admin, { companyId: session.companyId, avsenderId: session.userId, eventId: id, foer, etter: null }));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
