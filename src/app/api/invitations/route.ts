import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/**
 * Inviterer en kollega inn i selskapet.
 *
 * Supabase sender invitasjonsmailen og oppretter auth-brukeren. Selve
 * koblingen til selskapet gjør databasetriggeren når de logger inn første
 * gang — den slår opp invitasjonen på e-postadressen. Se 0010.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();

    // Bare admin inviterer. Sjekken hører hjemme her og ikke i UI-et: en
    // skjult knapp er ingen tilgangskontroll.
    const { data: me } = await admin
      .from("users")
      .select("role")
      .eq("id", session.userId)
      .single();

    if (me?.role !== "admin") {
      return NextResponse.json(
        { error: "Bare administratorer kan invitere medlemmer." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { email?: string; role?: UserRole };
    const email = (body.email ?? "").trim().toLowerCase();
    const role: UserRole = body.role === "admin" ? "admin" : "standard";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }

    // Er de allerede med, er invitasjonen meningsløs.
    const { data: alreadyMember } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (alreadyMember) {
      return NextResponse.json(
        { error: "Denne personen er allerede medlem." },
        { status: 409 },
      );
    }

    // En ny invitasjon til samme adresse erstatter den åpne. Ellers ville den
    // unike indeksen avvist forsøket, og brukeren fått en feil for noe som
    // burde vært en oppfriskning.
    await admin
      .from("invitations")
      .delete()
      .eq("company_id", session.companyId)
      .ilike("email", email)
      .is("accepted_at", null);

    const { data: invite, error } = await admin
      .from("invitations")
      .insert({
        company_id: session.companyId,
        email,
        role,
        invited_by: session.userId,
      })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    // Selve e-posten. Feiler den, står invitasjonen igjen og kan sendes på
    // nytt — vi ruller den ikke tilbake, for koblingen er det som betyr noe.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/tilbud/leads`,
    });

    // Lenken går tilbake uansett hvordan e-posten gikk. Den er den pålitelige
    // veien inn: e-postskannere i Microsoft 365 henter lenker automatisk, og
    // Supabase sin invitasjonslenke er en engangslenke som da er brukt opp før
    // mottakeren rekker å klikke. Vår egen tåler det — se
    // /api/invitations/aktiver.
    const link = `${appUrl}/invitasjon/${invite.token}`;

    if (inviteError) {
      return NextResponse.json({
        ok: true,
        link,
        warning:
          "Invitasjonen er registrert, men e-posten gikk ikke ut: " +
          `${inviteError.message}. Send lenken under i stedet.`,
      });
    }

    return NextResponse.json({ ok: true, link });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: me } = await admin
    .from("users")
    .select("role")
    .eq("id", session.userId)
    .single();

  if (me?.role !== "admin") {
    return NextResponse.json(
      { error: "Bare administratorer kan trekke invitasjoner." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("invitations")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
