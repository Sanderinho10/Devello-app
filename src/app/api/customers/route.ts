import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { KUNDEFELT, lesKundefelt } from "@/lib/kunder/felt";

/**
 * Oppretter en kunde for hånd.
 *
 * De fleste kundene oppstår av seg selv fra tilbud og ordrer; dette er for
 * den som vil ha kunden inn før første jobb. Navnet er påkrevd. En e-post
 * som alt finnes på en annen kunde avvises — én adresse er én kunde.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const felt = lesKundefelt(body, KUNDEFELT);
    if (!felt.name) {
      return NextResponse.json({ error: "Kunden må ha et navn." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("customers")
      .insert({ ...felt, company_id: session.companyId })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Det finnes allerede en kunde med denne e-postadressen." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
