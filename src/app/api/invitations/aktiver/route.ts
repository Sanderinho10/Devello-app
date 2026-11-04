import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/api";
import { harBrukerIAnnetSelskap, leggTilMedlemskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Den inviterte setter passordet sitt.
 *
 * Ruta er åpen — den som har tokenet har fått lenken av en administrator, og
 * det er hele beviset. Tokenet er 24 tilfeldige byte, brukes én gang og
 * utløper med invitasjonen.
 *
 * Merk at det er POST som bruker opp invitasjonen, ikke GET-en som viste
 * skjemaet. Det er poenget: e-postskannere henter lenker, de sender ikke
 * skjemaer.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
      full_name?: string;
    };

    const token = (body.token ?? "").trim();
    const password = body.password ?? "";
    let fullName = (body.full_name ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "Mangler invitasjon." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Passordet må ha minst åtte tegn." },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: invite } = await admin
      .from("invitations")
      .select("id, company_id, email, role, expires_at, token_used_at, fornavn, etternavn")
      .eq("token", token)
      .maybeSingle();

    if (!invite) {
      return NextResponse.json({ error: "Ugyldig invitasjon." }, { status: 404 });
    }
    if (invite.token_used_at) {
      return NextResponse.json(
        { error: "Denne invitasjonen er allerede brukt. Logg inn i stedet." },
        { status: 400 },
      );
    }
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invitasjonen har gått ut. Be om en ny." },
        { status: 400 },
      );
    }

    const email = invite.email.toLowerCase();
    // Navnet administratoren skrev ved invitasjonen, om den inviterte ikke skrev et selv.
    if (!fullName) fullName = [invite.fornavn, invite.etternavn].filter(Boolean).join(" ").trim();

    // Har personen alt en Devello-bruker i et annet selskap, skal passordet
    // deres ikke røres her. De logger inn som vanlig og godtar invitasjonen
    // innlogget (/api/invitations/godta) — da legges selskapet til.
    if (await harBrukerIAnnetSelskap(admin, email, invite.company_id)) {
      return NextResponse.json(
        { error: "Du har allerede en Devello-bruker. Logg inn, så kan du godta invitasjonen.", kode: "har_bruker" },
        { status: 409 },
      );
    }

    // Brukeren kan finnes fra før: invitasjoner sendt før vi gikk over til
    // Resend, opprettet en auth-bruker med én gang, uten passord. Da setter vi
    // passordet på den i stedet for å lage en ny.
    const { data: rad } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
    const eksisterende = rad ? (await admin.auth.admin.getUserById(rad.id as string)).data.user : null;

    let userId: string;
    if (eksisterende) {
      const { error } = await admin.auth.admin.updateUserById(eksisterende.id, {
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (error) throw new Error(error.message);
      userId = eksisterende.id;
    } else {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : undefined,
      });
      if (error || !created.user) {
        throw new Error(error?.message ?? "Kunne ikke opprette brukeren.");
      }
      userId = created.user.id;
    }

    // Raden og medlemskapet skrives her og ingen andre steder.
    const { error: userError } = await admin.from("users").upsert({
      id: userId,
      company_id: invite.company_id,
      email,
      full_name: fullName || null,
      role: invite.role,
    });
    if (userError) throw new Error(userError.message);
    await leggTilMedlemskap(admin, { userId, companyId: invite.company_id, role: invite.role });

    await admin
      .from("invitations")
      .update({ token_used_at: new Date().toISOString(), accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    return errorResponse(err);
  }
}
