import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { generatePartnerCode } from "@/lib/onboarding/partner-code";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Registrerer en regnskapsfører som partner og gir dem koden deres.
 *
 * Koden gir andel av omsetningen fra kundene de verver. Satsen ligger i
 * databasen per partner, ikke i koden her, så den kan avtales individuelt.
 *
 * Ruta er åpen — regnskapsføreren har ingen konto hos oss ennå, og skal ikke
 * trenge en for å bli partner.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      org_nr?: string;
      payout_account?: string;
      contact_email?: string;
      address_line?: string;
      postal_code?: string;
      city?: string;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Selskapsnavn mangler." }, { status: 400 });
    }

    const orgCheck = validateOrgNr(body.org_nr ?? "");
    if (!orgCheck.ok) {
      return NextResponse.json({ error: orgCheck.error }, { status: 400 });
    }
    const orgNr = normalizeOrgNr(body.org_nr ?? "");

    const account = normalizeAccount(body.payout_account ?? "");
    if (!account) {
      return NextResponse.json(
        { error: "Utbetalingskontoen må ha elleve siffer." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Er de partner fra før, gir vi tilbake koden de allerede har. Det er det
    // de er ute etter — ikke en ny kode som gjør den gamle verdiløs.
    const { data: existing } = await admin
      .from("partners")
      .select("code")
      .eq("org_nr", orgNr)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ code: existing.code, existing: true });
    }

    const code = await generatePartnerCode(admin);

    const { error } = await admin.from("partners").insert({
      code,
      name,
      org_nr: orgNr,
      payout_account: account,
      contact_email: (body.contact_email ?? "").trim().toLowerCase() || null,
      address_line: (body.address_line ?? "").trim() || null,
      postal_code: (body.postal_code ?? "").trim() || null,
      city: (body.city ?? "").trim() || null,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ code, existing: false });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Norske kontonummer er elleve siffer. Punktum og mellomrom er pynt. */
function normalizeAccount(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}
