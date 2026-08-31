import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Krymper eller åpner et varsel, permanent, for én bruker.
 *
 * Listen ligger på brukeren og ikke på selskapet: den ene har bestemt seg for
 * å jobbe uten postkasse, kollegaen har kanskje ikke sett varselet ennå.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json()) as { id?: string; skjul?: boolean };
    const id = (body.id ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "Mangler varsel-id." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data: bruker } = await admin
      .from("users")
      .select("skjulte_varsel")
      .eq("id", session.userId)
      .single();

    const naa: string[] = bruker?.skjulte_varsel ?? [];
    const neste =
      body.skjul === false
        ? naa.filter((v) => v !== id)
        : naa.includes(id)
          ? naa
          : [...naa, id];

    const { error } = await admin
      .from("users")
      .update({ skjulte_varsel: neste })
      .eq("id", session.userId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, skjulte_varsel: neste });
  } catch (err) {
    return errorResponse(err);
  }
}
