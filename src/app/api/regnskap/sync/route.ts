import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { synkroniserFakturaer } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * «Hent fakturaer» — samme mønster som «Hent leads»: alle i selskapet kan
 * trykke. Selve jobben ligger i synkroniserFakturaer(companyId), så en
 * cron kan kalle den direkte senere uten sesjon.
 */
export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const avvist = await ordreModulEllers403(supabaseAdmin(), session.companyId);
    if (avvist) return avvist;

    const resultat = await synkroniserFakturaer(session.companyId, { trigger: "manuell" });
    if (resultat.ikkeTilkoblet) {
      return NextResponse.json(
        { error: "Ikke tilkoblet noe regnskapssystem. Koble til under Innstillinger." },
        { status: 400 },
      );
    }
    return NextResponse.json(resultat);
  } catch (err) {
    return errorResponse(err);
  }
}
