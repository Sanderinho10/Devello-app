import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { requireAdmin } from "@/lib/api-admin";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Firmaopplysninger og fakturaadresse. Selskapsnivå, ikke agentnivå. */
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

    const { error } = await supabaseAdmin()
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
