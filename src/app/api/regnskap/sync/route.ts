import { NextResponse } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { hentAlleLeverandorfakturaer } from "@/lib/regnskap/hent-alle";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * «Hent fakturaer nå» — samme mønster som «Hent leads»: alle i selskapet kan
 * trykke. Henter fra begge kildene, PowerOffice Go og grossistenes
 * fakturafiler på FTP, inn i den samme listen (lib/regnskap/hent-alle.ts).
 */
export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const resultat = await hentAlleLeverandorfakturaer(admin, session.companyId);
    if (!resultat.harKilde) {
      return NextResponse.json(
        {
          error:
            "Ingen fakturakilde er satt opp. Koble til PowerOffice Go under Selskap → Innstillinger → Regnskap, eller legg inn fakturafiler på en grossist.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(resultat);
  } catch (err) {
    return errorResponse(err);
  }
}
