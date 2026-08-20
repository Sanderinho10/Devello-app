import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import {
  UgyldigBilde,
  lagreMerkevarebilde,
  sjekkStoerrelse,
} from "@/lib/brand/lagre-bilde";
import { normalizeOrgNr, validateOrgNr } from "@/lib/onboarding/orgnr";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase/server";
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
/**
 * Taket på hele kroppen.
 *
 * Logoen kommer som base64 og blir en tredjedel større på veien, så 2 MB fil
 * blir ~2,7 MB tekst. Dette er et åpent endepunkt: kroppen leses helt inn i
 * minnet før vi får sett på innholdet, så grensa må stå FØR json().
 */
const MAKS_KROPP_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const oppgittLengde = Number(request.headers.get("content-length") ?? 0);
    if (oppgittLengde > MAKS_KROPP_BYTES) {
      return NextResponse.json(
        { error: "Logoen kan være opptil 2 MB. Skaler den ned først." },
        { status: 413 },
      );
    }

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
      /**
       * Profilen tilbudene skal ha. Alt er valgfritt — poenget med steget er
       * at det blir spurt om, ikke at det blir krevd.
       */
      brand?: {
        maalform?: string;
        primary_color?: string;
        contact_name?: string;
        contact_email?: string;
        contact_phone?: string;
        website?: string;
        /**
         * Logoen som base64. Den kan ikke lastes opp på vanlig måte her:
         * /api/brand/logo krever en sesjon, og på dette tidspunktet finnes
         * verken selskapet eller brukeren. Krever oppsettet e-postbekreftelse,
         * kommer sesjonen først timer senere — og da hadde fila vært borte.
         */
        logo?: { data: string; filnavn: string; mime: string };
      };
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

    // Logoen valideres før vi oppretter noe. Et åpent endepunkt skal ikke ta
    // imot vilkårlig store kropper, og en fil som blir avvist etter at
    // kontoen er laget ville krevd opprydding for ingenting.
    const logo = body.brand?.logo;
    let logoBytes: Buffer | null = null;
    if (logo?.data) {
      try {
        logoBytes = Buffer.from(logo.data, "base64");
        // Buffer.from kaster ikke på ugyldig base64 — den hopper over tegnene
        // den ikke kjenner og kan ende på null bytes. Da er det ikke et bilde.
        if (logoBytes.byteLength === 0) {
          throw new UgyldigBilde("Logofila kunne ikke leses. Prøv å velge den på nytt.");
        }
        sjekkStoerrelse(logoBytes.byteLength);
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof UgyldigBilde ? err.message : "Logofila kunne ikke leses.",
          },
          { status: 400 },
        );
      }
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
    // Uten egen SMTP er Supabase sin innebygde e-post kraftig ratebegrenset, og
    // en kunde som aldri får bekreftelsesmailen kommer aldri inn. Derfor er
    // bekreftelse av som standard, og slås på med en miljøvariabel når SMTP er
    // satt opp — se docs/smtp-oppsett.md. Å styre det herfra betyr at
    // omleggingen er en konfigurasjonsendring og ikke en ny utrulling.
    const requireConfirmation =
      process.env.AUTH_REQUIRE_EMAIL_CONFIRMATION === "true";

    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: !requireConfirmation,
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
          tone_settings:
            body.brand?.maalform === "nn" ? { maalform: "nn" } : { maalform: "nb" },
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

      // 4. Merkevareraden, med det de fylte ut i steg 3.
      //
      // Tomme felter blir null og ikke tomme strenger: PDF-malen hopper over
      // en null, men ville satt av plass til en tom streng.
      const b = body.brand ?? {};
      await admin.from("company_brand").insert({
        company_id: company.id,
        // Kolonnen er not null med en standardfarge — bare overstyr den når
        // de faktisk valgte noe.
        ...(b.primary_color?.trim() ? { primary_color: b.primary_color.trim() } : {}),
        contact_name: (b.contact_name ?? "").trim() || null,
        contact_email: (b.contact_email ?? "").trim().toLowerCase() || null,
        contact_phone: (b.contact_phone ?? "").trim() || null,
        website: (b.website ?? "").trim() || null,
      });

      // 5. Logoen, om de la inn en.
      //
      // Feiler den, står kontoen likevel. De kan legge inn logoen fra
      // innstillingene etterpå — å rulle tilbake en ferdig registrering
      // fordi et bilde ikke ville lagre seg, er ute av proporsjoner.
      if (logoBytes && logo) {
        try {
          await lagreMerkevarebilde(admin, {
            companyId: company.id,
            type: "logo",
            bytes: logoBytes,
            filnavn: logo.filnavn || "logo.png",
            mimeType: logo.mime || "",
          });
        } catch (err) {
          console.error(
            "Logo fra registreringen kunne ikke lagres:",
            err instanceof Error ? err.message : err,
          );
        }
      }

      // 6. Bekreftelseslenka.
      //
      // admin.createUser oppretter brukeren rett i databasen og sender
      // ingenting — det finnes ikke noe flagg som ber den sende. Skal kunden
      // få lenka, må vi be Supabase om det etterpå. resend() med type
      // «signup» gjør nettopp det for en bruker som ennå ikke har bekreftet.
      //
      // Feiler sendingen, sier vi fra i stedet for å påstå at den gikk. En
      // kunde som venter på en e-post som aldri kommer, prøver igjen og
      // igjen og gir til slutt opp — uten å vite hvorfor.
      let emailError: string | null = null;
      if (requireConfirmation) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
        const { error: sendError } = await supabaseAnon().auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${appUrl}/auth/callback` },
        });
        if (sendError) {
          emailError = sendError.message;
          console.error("Bekreftelseslenke kunne ikke sendes:", sendError.message);
        }
      }

      return NextResponse.json({
        ok: true,
        company_id: company.id,
        requires_confirmation: requireConfirmation,
        email_error: emailError,
      });
    } catch (err) {
      // Rydd opp, ellers blokkerer den halve kontoen e-postadressen for alltid.
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
