import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { byttSelskap, leggTilMedlemskap } from "@/lib/selskap/medlemskap";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * En innlogget bruker godtar en invitasjon til et selskap til: `{ token }`.
 *
 * For dem som alt har en Devello-bruker. Passordet røres ikke; selskapet
 * legges til medlemskapene, og brukeren står i det nye selskapet etterpå.
 * Invitasjonen må være til akkurat den innloggede adressen.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) return NextResponse.json({ error: "Mangler invitasjon." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: invite } = await admin
      .from("invitations")
      .select("id, company_id, email, role, expires_at, token_used_at")
      .eq("token", token)
      .maybeSingle();

    if (!invite) return NextResponse.json({ error: "Ugyldig invitasjon." }, { status: 404 });
    if (invite.token_used_at) return NextResponse.json({ error: "Denne invitasjonen er allerede brukt." }, { status: 400 });
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invitasjonen har gått ut. Be om en ny." }, { status: 400 });
    }
    if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
      return NextResponse.json(
        { error: `Invitasjonen er til ${invite.email}. Du er logget inn som ${session.email}.` },
        { status: 403 },
      );
    }

    await leggTilMedlemskap(admin, { userId: session.userId, companyId: invite.company_id, role: invite.role });
    await byttSelskap(admin, session.userId, invite.company_id);
    await admin
      .from("invitations")
      .update({ token_used_at: new Date().toISOString(), accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
