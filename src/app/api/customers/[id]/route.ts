import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { KUNDEFELT, lesKundefelt } from "@/lib/kunder/felt";

/**
 * Oppdaterer kundekortet. Bare feltene som sendes endres.
 *
 * Endringer her rører ikke tilbud eller ordrer: kundefeltene der er
 * dokumentets og ordrens egne, og skal vise det som gjaldt da.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const felt = lesKundefelt(body, KUNDEFELT);
    if (felt.name !== undefined && !felt.name) {
      return NextResponse.json({ error: "Kunden må ha et navn." }, { status: 400 });
    }
    if (Object.keys(felt).length === 0) {
      return NextResponse.json({ error: "Ingenting å endre." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data, error } = await admin
      .from("customers")
      .update(felt)
      .eq("id", id)
      .eq("company_id", session.companyId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Det finnes allerede en kunde med denne e-postadressen." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: "Fant ikke kunden" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
