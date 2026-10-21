import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { develloAdminEllers403 } from "@/lib/devello-admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { lesFakturaFelt } from "./felt";

/**
 * Ny abonnementsfaktura til et selskap. Bare for Devello (DEVELLO_ADMIN_EPOST).
 * Sesjonen sjekkes uten abonnementskravet: Devello skal kunne føre fakturaer
 * selv om eget selskap skulle stå uten pakke.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;
  const nei = develloAdminEllers403(session);
  if (nei) return nei;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    if (!companyId) return NextResponse.json({ error: "Velg et selskap." }, { status: 400 });

    const lest = lesFakturaFelt(body, true);
    if ("feil" in lest) return NextResponse.json({ error: lest.feil }, { status: 400 });

    const { data, error } = await supabaseAdmin()
      .from("devello_fakturaer")
      .insert({ company_id: companyId, ...lest.felt })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: `Faktura ${lest.felt.fakturanr} finnes fra før for selskapet.` }, { status: 409 });
      }
      throw new Error(error.message);
    }
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
