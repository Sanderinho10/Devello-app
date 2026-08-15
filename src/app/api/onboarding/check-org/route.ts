import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Er organisasjonsnummeret ledig?
 *
 * Kjøres når man går videre fra første steg, så feilen kommer der den hører
 * hjemme — ikke etter at brukeren har fylt ut resten og trykket opprett.
 *
 * Ruta er åpen, siden den brukes før innlogging. Den svarer bare ja eller nei
 * på et nummer den som spør allerede sitter med, og røper verken navn eller
 * noe annet om selskapet som eventuelt har det.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { org_nr?: string };

    const check = validateOrgNr(body.org_nr ?? "");
    if (!check.ok) {
      return NextResponse.json({ available: false, error: check.error });
    }

    const taken = await orgNrTaken(normalizeOrgNr(body.org_nr ?? ""));
    if (taken) {
      return NextResponse.json({
        available: false,
        error:
          "Dette organisasjonsnummeret er allerede registrert. Har en kollega " +
          "opprettet kontoen, be dem invitere deg inn.",
      });
    }

    return NextResponse.json({ available: true });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Organisasjonsnummer lagres normalisert, så oppslaget er en enkel likhet.
 * Den unike indeksen i databasen sammenligner på sifrene uansett, og fanger
 * eventuelle eldre rader som ble lagret med mellomrom.
 */
export async function orgNrTaken(digits: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("companies")
    .select("id")
    .eq("org_nr", digits)
    .maybeSingle();
  return Boolean(data);
}
