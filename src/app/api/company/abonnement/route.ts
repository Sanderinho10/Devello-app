import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { findAgent } from "@/lib/billing/agents";
import { seiOppPakke, velgPakke } from "@/lib/billing/subscription";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Velger, bytter eller sier opp pakke på én agent.
 *
 * Ingen betaling er koblet på: dette skriver avtalen og ikke noe mer. Kommer
 * det en betalingsleverandør, er det her den hektes inn — abonnementsraden har
 * allerede pris, kvote og sats den trenger.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      plan?: string;
      agent?: string;
      handling?: "velg" | "si_opp" | "angre_oppseiing";
    };
    const admin = supabaseAdmin();
    const handling = body.handling ?? "velg";

    if (handling === "velg") {
      const { agentId } = await velgPakke(admin, session.companyId, body.plan ?? "");
      return NextResponse.json({ ok: true, agent: agentId, plan: body.plan });
    }

    const agent = findAgent(body.agent);
    if (!agent) {
      return NextResponse.json({ error: "Ukjent agent." }, { status: 400 });
    }
    await seiOppPakke(
      admin,
      session.companyId,
      agent.id,
      handling === "angre_oppseiing",
    );
    return NextResponse.json({ ok: true, agent: agent.id });
  } catch (err) {
    return errorResponse(err);
  }
}
