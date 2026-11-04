import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { EpostIkkeSattOpp, epostRamme, sendEpost } from "@/lib/epost/send";
import { erMedlem, harBrukerIAnnetSelskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/**
 * Inviterer en kollega inn i selskapet.
 *
 * Vi sender invitasjonsmailen selv, over Resend, med lenke til vår egen
 * invitasjonsside. Tidligere gjorde Supabase det (inviteUserByEmail), men den
 * e-posten kom ikke fram — samme grunn som innloggingslenka ble flyttet, se
 * /api/auth/lenke. Auth-brukeren opprettes først når den inviterte velger
 * passord (/api/invitations/aktiver), og først da er de aktive.
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
      .select("role, full_name")
      .eq("id", session.userId)
      .single();

    if (me?.role !== "admin") {
      return NextResponse.json(
        { error: "Bare administratorer kan invitere medlemmer." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as { email?: string; role?: UserRole; fornavn?: string; etternavn?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const role: UserRole = body.role === "admin" ? "admin" : "standard";
    const fornavn = (body.fornavn ?? "").trim().slice(0, 60);
    const etternavn = (body.etternavn ?? "").trim().slice(0, 60);

    if (!fornavn || !etternavn) {
      return NextResponse.json({ error: "Skriv inn fornavn og etternavn." }, { status: 400 });
    }
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Ugyldig e-postadresse." }, { status: 400 });
    }

    // Er de allerede med, er invitasjonen meningsløs.
    if (await erMedlem(admin, email, session.companyId)) {
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
        fornavn,
        etternavn,
        invited_by: session.userId,
      })
      .select("token")
      .single();
    if (error) throw new Error(error.message);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const link = `${appUrl}/invitasjon/${invite.token}`;

    const { data: firma } = await admin
      .from("companies")
      .select("name")
      .eq("id", session.companyId)
      .maybeSingle();
    const selskap = firma?.name ?? "selskapet";
    const fra = me?.full_name?.trim() || "En kollega";

    // Har personen alt en Devello-bruker i et annet selskap, tar lenken dem
    // til «logg inn og bli med», og selskapet legges til i velgeren deres.
    const harBruker = await harBrukerIAnnetSelskap(admin, email, session.companyId);

    const { html, tekst } = epostRamme({
      overskrift: `Du er invitert til ${escape(selskap)} i Devello`,
      avsnitt: [
        `Hei ${escape(fornavn)}!`,
        `${escape(fra)} har invitert deg inn i ${escape(selskap)} i Devello.`,
        harBruker
          ? "Du har allerede en Devello-bruker. Trykk på knappen, logg inn som vanlig og trykk «Bli med» — så kan du bytte mellom selskapene i menyen."
          : "Trykk på knappen og velg et passord, så er du inne.",
      ],
      knapp: { tekst: harBruker ? "Bli med" : "Godta invitasjonen", url: link },
      fot: "Invitasjonen varer i to uker. Var den ikke ment for deg, kan du se bort fra denne e-posten.",
    });

    // Feiler e-posten, står invitasjonen igjen og lenken går tilbake — den
    // virker like godt sendt på SMS. Vi ruller ikke tilbake.
    try {
      const { id } = await sendEpost({
        til: email,
        emne: `Invitasjon til ${selskap} i Devello`,
        html,
        tekst,
      });
      console.info(`invitasjon sendt til ${maskert(email)} (resend id ${id})`);
    } catch (err) {
      const grunn =
        err instanceof EpostIkkeSattOpp ? err.message : err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        ok: true,
        sendt: false,
        link,
        warning: `Invitasjonen er registrert, men e-posten gikk ikke ut: ${grunn} Send lenken under i stedet.`,
      });
    }

    return NextResponse.json({ ok: true, sendt: true, link });
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

/** Navn og firmanavn havner i HTML-en. */
function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** «sa***@hotmail.com». */
function maskert(email: string): string {
  const [navn, domene] = email.split("@");
  return `${navn.slice(0, 2)}***@${domene ?? ""}`;
}
