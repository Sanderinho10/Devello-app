import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { mergeToneSettings } from "@/lib/company/tone";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Alt som gjelder hele selskapet: firmaopplysninger, adresse, profilen på
 * tilbudene og målformen. Agentsidene eier bare sitt eget — se
 * /api/settings.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const denied = await requireAdmin(session);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      name?: string;
      org_nr?: string;
      billing_address_line?: string;
      billing_postal_code?: string;
      billing_city?: string;
      maalform?: string;
      primary_color?: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      website?: string;
    };

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Selskapsnavn mangler." }, { status: 400 });
    }

    // Organisasjonsnummeret er valgfritt her, men er det fylt ut skal det være
    // ekte — samme krav som ved registrering.
    let orgNr: string | null = null;
    const given = (body.org_nr ?? "").trim();
    if (given) {
      const check = validateOrgNr(given);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
      orgNr = normalizeOrgNr(given);
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("companies")
      .update({
        name,
        org_nr: orgNr,
        billing_address_line: (body.billing_address_line ?? "").trim() || null,
        billing_postal_code: (body.billing_postal_code ?? "").trim() || null,
        billing_city: (body.billing_city ?? "").trim() || null,
      })
      .eq("id", session.companyId);

    if (error) {
      // Den unike indeksen slår til om nummeret alt er i bruk.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Dette organisasjonsnummeret er registrert på et annet selskap." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }

    // Målformen ligger i tone_settings sammen med signatur og tilleggsinstruks,
    // som agentsiden eier. Derfor sammenslåing og ikke overskriving.
    const toneResult = await mergeToneSettings(admin, session.companyId, {
      maalform: body.maalform === "nn" ? "nn" : "nb",
    });
    if (toneResult.error) throw new Error(toneResult.error);

    // Profilen på tilbudene. logo_path står utenfor med vilje — logoen lastes
    // opp for seg selv i /api/brand/logo, og ville blitt slettet av et lagre
    // herfra.
    const { error: brandError } = await admin.from("company_brand").upsert(
      {
        company_id: session.companyId,
        primary_color: body.primary_color || "#1d1d1f",
        contact_name: (body.contact_name ?? "").trim() || null,
        contact_email: (body.contact_email ?? "").trim() || null,
        contact_phone: (body.contact_phone ?? "").trim() || null,
        website: (body.website ?? "").trim() || null,
      },
      { onConflict: "company_id" },
    );
    if (brandError) throw new Error(brandError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
