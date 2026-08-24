import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Veksler inn innloggingstokenet vårt i en Supabase-sesjon.
 *
 * Det er POST-en som bruker opp lenken, ikke GET-en som viste siden. Det er
 * hele poenget med å ha et eget token: e-postskannere henter lenker, de sender
 * ikke skjemaer. Supabase-tokenet lages først her — i det øyeblikket et
 * menneske har trykket — og blir vekslet inn av nettleseren med én gang.
 *
 * Ruta er åpen. Den som har tokenet har fått det i innboksen sin, og det er
 * beviset.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    const token = (body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "Mangler lenke." }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Merk brukt FØR vi lager Supabase-tokenet, og bare hvis den fortsatt er
    // ubrukt. To samtidige forsøk kan da ikke begge få en sesjon: den andre
    // oppdaterer null rader og får ingenting.
    const { data: rad, error } = await admin
      .from("login_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    if (!rad) {
      return NextResponse.json(
        { error: "Lenken er brukt opp eller har gått ut. Be om en ny." },
        { status: 410 },
      );
    }

    const { data: bruker } = await admin.auth.admin.getUserById(rad.user_id);
    const email = bruker.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Fant ikke brukeren." }, { status: 404 });
    }

    // generateLink sender ingen e-post — den lager bare tokenet. Det er
    // nøyaktig det vi vil ha: hashed_token går rett til nettleseren som
    // spurte, og veksles inn i en sesjon der.
    const { data: lenke, error: lenkeFeil } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (lenkeFeil || !lenke.properties?.hashed_token) {
      throw new Error(lenkeFeil?.message ?? "Kunne ikke lage innloggingen.");
    }

    return NextResponse.json({
      ok: true,
      token_hash: lenke.properties.hashed_token,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
