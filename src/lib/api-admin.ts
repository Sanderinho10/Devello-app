import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SessionContext } from "@/lib/supabase/server";

/**
 * Krever at den innloggede brukeren er admin i sitt eget selskap.
 *
 * Sjekken hører hjemme i API-et og ikke bare i UI-et: en skjult knapp er ingen
 * tilgangskontroll, og rutene kan kalles direkte.
 */
export async function requireAdmin(
  session: SessionContext,
): Promise<NextResponse | null> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("role")
    .eq("id", session.userId)
    .single();

  if (data?.role !== "admin") {
    return NextResponse.json(
      { error: "Bare administratorer kan gjøre dette." },
      { status: 403 },
    );
  }
  return null;
}
