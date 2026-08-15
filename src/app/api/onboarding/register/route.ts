import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { supabaseAdmin } from "@/lib/supabase/server";
import { orgNrTaken } from "../check-org/route";

/**
 * Oppretter selskap + første bruker.
 *
 * Rekkefølgen er nøye: auth-brukeren først, fordi users.id peker på den, og
 * selskapet etterpå. Ryker noe underveis, ryddes auth-brukeren bort igjen —
 * ellers sitter det en konto uten selskap som verken kan logge inn eller
 * registrere seg på nytt med samme e-post.
 *
 * Brukeren blir admin. Det er den eneste rollen som gir mening for den som
 * oppretter selskapet, og noen må kunne invitere de andre inn.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      company_name?: string;
      org_nr?: string;
      billing_address_line?: string;
      billing_postal_code?: string;
      billing_city?: string;
      full_name?: string;
      email?: string;
      password?: string;
      partner_code?: string;
    };

    const companyName = (body.company_name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = (body.full_name ?? "").trim() || null;

    if (!companyName) {
      return NextResponse.json({ error: "Selskapsnavn mangler." }, { status: 400 });
    }

    const orgCheck = validateOrgNr(body.org_nr ?? "");
    if (!orgCheck.ok) {
      return NextResponse.json({ error: orgCheck.error }, { status: 400 });
    }
    const orgNr = normalizeOrgNr(body.org_nr ?? "");

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Passordet må ha minst åtte tegn." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();

    // Sjekket i steg 1 også, men det er et annet kall og en annen tid. To
    // registreringer med samme nummer kan ha passert steg 1 samtidig.
    if (await orgNrTaken(orgNr)) {
      return NextResponse.json(
        { error: "Dette organisasjonsnummeret er allerede registrert." },
        { status: 409 },
      );
    }

    // Partnerkoden er valgfri, men er den oppgitt skal den finnes. En kode som
    // er skrevet feil skal si fra nå, ikke bli oppdaget når andelen uteblir.
    let partnerCode: string | null = null;
    const givenCode = (body.partner_code ?? "").trim().toUpperCase();
    if (givenCode) {
      const { data: partner } = await admin
        .from("partners")
        .select("code")
        .eq("code", givenCode)
        .eq("active", true)
        .maybeSingle();
      if (!partner) {
        return NextResponse.json(
          { error: "Fant ingen aktiv partner med denne koden. Sjekk skrivemåten." },
          { status: 400 },
        );
      }
      partnerCode = partner.code;
    }

    // 1. Auth-brukeren.
    //
    // email_confirm: true fordi Supabase-prosjektet ennå ikke har egen SMTP —
    // den innebygde e-posten er kraftig ratebegrenset, og en kunde som ikke får
    // bekreftelsesmailen kommer aldri inn. Slå på bekreftelse i Supabase når
    // SMTP er satt opp, og sett denne til false.
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError || !created.user) {
      const message = authError?.message ?? "Kunne ikke opprette brukeren.";
      return NextResponse.json(
        {
          error: /already been registered|already exists/i.test(message)
            ? "Det finnes allerede en bruker med denne e-postadressen. Logg inn i stedet."
            : message,
        },
        { status: 400 },
      );
    }

    const userId = created.user.id;

    try {
      // 2. Selskapet, med én måned gratis fra nå.
      const trialEnds = new Date();
      trialEnds.setMonth(trialEnds.getMonth() + 1);

      const { data: company, error: companyError } = await admin
        .from("companies")
        .insert({
          name: companyName,
          org_nr: orgNr,
          billing_address_line: (body.billing_address_line ?? "").trim() || null,
          billing_postal_code: (body.billing_postal_code ?? "").trim() || null,
          billing_city: (body.billing_city ?? "").trim() || null,
          trial_ends_at: trialEnds.toISOString(),
          partner_code: partnerCode,
        })
        .select("id")
        .single();

      if (companyError) throw new Error(companyError.message);

      // 3. Brukeren, som admin.
      const { error: userError } = await admin.from("users").upsert({
        id: userId,
        company_id: company.id,
        email,
        full_name: fullName,
        role: "admin",
      });
      if (userError) throw new Error(userError.message);

      // 4. Tom merkevarerad, så innstillingssiden har noe å redigere.
      await admin
        .from("company_brand")
        .insert({ company_id: company.id })
        .select()
        .maybeSingle();

      return NextResponse.json({ ok: true, company_id: company.id });
    } catch (err) {
      // Rydd opp, ellers blokkerer den halve kontoen e-postadressen for alltid.
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
