import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentTimeforslag } from "@/lib/kalender/hent-timeforslag";
import { osloDato, pluss } from "@/lib/kalender/oslo";
import { erAdmin } from "@/lib/ordre/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Timeforslag frå kalenderen på éin ordre, dei siste 14 dagane.
 * Administrator ser forslaga for alle montørane; andre berre sine eigne.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const { data: ordre } = await admin.from("orders").select("id").eq("id", id).eq("company_id", session.companyId).maybeSingle();
    if (!ordre) return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });

    const til = osloDato(new Date());
    const forslag = await hentTimeforslag(admin, session.companyId, {
      fra: pluss(til, -13),
      til,
      orderId: id,
      brukarId: (await erAdmin(admin, session)) ? null : session.userId,
    });
    return NextResponse.json({ forslag });
  } catch (err) {
    return errorResponse(err);
  }
}
