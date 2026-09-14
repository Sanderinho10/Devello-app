import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { harModul } from "@/lib/moduler";

/**
 * Ordremodulen bak modulflagget — i API-et.
 *
 * Sidemenyen og ordre-layouten skjuler modulen for selskaper uten den, men
 * rutene kan kalles direkte. Hver rute i modulen gjør denne sjekken selv,
 * så en skjult side aldri er eneste sperre. Kall slik:
 *
 *   const avvist = await ordreModulEllers403(admin, session.companyId);
 *   if (avvist) return avvist;
 */
export async function ordreModulEllers403(
  admin: SupabaseClient,
  companyId: string,
): Promise<NextResponse | null> {
  const { data: company } = await admin
    .from("companies")
    .select("moduler")
    .eq("id", companyId)
    .single();

  if (!harModul(company?.moduler, "ordre")) {
    return NextResponse.json(
      { error: "Ordre-modulen er ikke aktivert for dette selskapet." },
      { status: 403 },
    );
  }
  return null;
}
