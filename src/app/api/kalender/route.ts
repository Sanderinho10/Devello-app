import { NextResponse, after, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import {
  hentForVarsel,
  hentHendingar,
  hentKolleger,
  lagreDeltakarar,
  lesHendingInput,
  loggTekst,
  sjekkTilhoyrsle,
} from "@/lib/kalender/hent";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import { varsleKalenderendring } from "@/lib/varsel/send";

const MAKS_SPENN_MS = 120 * 24 * 60 * 60 * 1000;

/** Eit tidspunkt frå søkjeparameteren, eller null. */
function tidspunkt(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Kalenderen for eit tidsrom.
 *
 *   GET /api/kalender?fra=<ISO>&til=<ISO>[&bruker=<id>]
 *   GET /api/kalender?ordre=<id>          — alle avtalane på ordren
 *
 * Svaret har òg kollegane (radene i montørvisninga) og om den innlogga får
 * endre — så sida treng berre eitt kall.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const p = request.nextUrl.searchParams;
    const orderId = p.get("ordre");
    const fra = tidspunkt(p.get("fra"));
    const til = tidspunkt(p.get("til"));
    if (!orderId) {
      if (!fra || !til || til <= fra) {
        return NextResponse.json({ error: "Oppgi fra og til." }, { status: 400 });
      }
      if (til.getTime() - fra.getTime() > MAKS_SPENN_MS) {
        return NextResponse.json({ error: "Tidsrommet er for langt (høyst 120 dager)." }, { status: 400 });
      }
    }

    const [hendingar, kolleger, kanRedigere] = await Promise.all([
      hentHendingar(admin, session.companyId, { fra, til, brukarId: p.get("bruker"), orderId }),
      hentKolleger(admin, session.companyId),
      erAdmin(admin, session),
    ]);
    return NextResponse.json({ hendingar, kolleger, kan_redigere: kanRedigere, meg: session.userId });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Ny avtale. Berre administrator. Oppdrag blir òg skrivne i hendingsloggen på ordren. */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    if (!(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Bare administratorer kan endre kalenderen." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = lesHendingInput(body);
    if ("feil" in input) return NextResponse.json({ error: input.feil }, { status: 400 });
    const sjekk = await sjekkTilhoyrsle(admin, session.companyId, input);
    if ("feil" in sjekk) return NextResponse.json({ error: sjekk.feil }, { status: 400 });

    const { deltakarar, ...rad } = input;
    const { data, error } = await admin
      .from("calendar_events")
      .insert({ ...rad, company_id: session.companyId, created_by: session.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      await lagreDeltakarar(admin, session.companyId, data.id, deltakarar);
    } catch (err) {
      // Ein avtale utan dei som skal vere med er verre enn ingen avtale.
      await admin.from("calendar_events").delete().eq("id", data.id);
      throw err;
    }

    if (sjekk.order) {
      await admin.from("order_events").insert({
        order_id: sjekk.order.id,
        kind: "planlagt",
        note: `Planlagt: ${loggTekst(input, sjekk.namn)}`,
        created_by: session.userId,
      });
    }

    // Montørane får vite det etter at svaret er sendt — sjefen ventar ikkje på e-post.
    const eventId = data.id as string;
    after(async () => {
      const etter = await hentForVarsel(admin, session.companyId, eventId);
      await varsleKalenderendring(admin, { companyId: session.companyId, avsenderId: session.userId, eventId, foer: null, etter });
    });

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
