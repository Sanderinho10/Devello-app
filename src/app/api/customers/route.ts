import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { KUNDEFELT, lesKundefelt } from "@/lib/kunder/felt";

/**
 * Søk i kunderegisteret, til forslagene i skjemaene. Treff på navn, e-post,
 * kontaktperson og telefon; de åtte beste. Uten søkeord: ingen treff — en
 * liste over alle kunder er /kunder, ikke dette.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ kunder: [] });

    // PostgREST-filteret skiller på komma og parenteser; de har ingen plass
    // i et søkeord uansett.
    const monster = `%${q.replace(/[%_,()]/g, " ")}%`;
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("customers")
      .select("id, name, contact, email, phone, address")
      .eq("company_id", session.companyId)
      .or(
        `name.ilike.${monster},email.ilike.${monster},contact.ilike.${monster},phone.ilike.${monster}`,
      )
      .order("name")
      .limit(8);
    if (error) throw new Error(error.message);
    return NextResponse.json({ kunder: data ?? [] });
  } catch (err) {
    return errorResponse(err);
  }
}

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
