import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const admin = supabaseAdmin();

    // Navn og organisasjonsnummer eies av /api/company. Skrev vi dem her også,
    // ville et lagre på agentsiden trukket tilbake en endring gjort under
    // Selskap.
    const { error: companyError } = await admin
      .from("companies")
      .update({
        tone_settings: {
          formalitet: body.formalitet,
          maalform: body.maalform === "nn" ? "nn" : "nb",
          signatur: body.signatur || undefined,
          tillegg: body.tillegg || undefined,
        },
      })
      .eq("id", session.companyId);
    if (companyError) throw new Error(companyError.message);

    const { error: brandError } = await admin.from("company_brand").upsert(
      {
        company_id: session.companyId,
        // logo_path settes ikke herfra — logoen lastes opp for seg selv i
        // /api/brand/logo. Tas den med her, ville et lagret skjema uten
        // filfeltet slettet den.
        primary_color: body.primary_color || "#1d1d1f",
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        address_line: body.address_line || null,
        postal_code: body.postal_code || null,
        city: body.city || null,
        website: body.website || null,
        footer_note: body.footer_note || null,
      },
      { onConflict: "company_id" },
    );
    if (brandError) throw new Error(brandError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
