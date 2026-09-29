import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { finnPakke } from "@/lib/billing/katalog";
import { seiOppPakke, velgPakke } from "@/lib/billing/subscription";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Velger, bytter eller sier opp pakken.
 *
 *   { pakke: "plattform" }                       → velg / bytt
 *   { handling: "si_opp" | "angre_oppseiing" }   → oppsigelse fra periodeslutt
 *
 * Ingen betaling er koblet på: dette skriver avtalen og ikke noe mer. Kommer
 * det en betalingsleverandør, er det her den hektes inn — abonnementsraden
 * har allerede pris, inkluderte enheter og enhetspriser den trenger.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      pakke?: string;
      handling?: "velg" | "si_opp" | "angre_oppseiing";
    };
    const admin = supabaseAdmin();
    const handling = body.handling ?? "velg";

    if (handling === "velg") {
      if (!finnPakke(body.pakke)) return NextResponse.json({ error: "Ukjent pakke." }, { status: 400 });
      const { pakke } = await velgPakke(admin, session.companyId, body.pakke ?? "");
      return NextResponse.json({ ok: true, pakke: pakke.id });
    }

    await seiOppPakke(admin, session.companyId, handling === "angre_oppseiing");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
