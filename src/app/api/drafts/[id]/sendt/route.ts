import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * «Jeg har sendt tilbudet.»
 *
 * Vi kan ikke vite dette selv. Appen har ikke Mail.Send, og den som sender fra
 * Outlook eller fra sin egen e-post gjør det utenfor vår rekkevidde. Så det er
 * mennesket som sier fra, og det de sier låser utkastet.
 *
 * Låsingen er hele poenget: et tilbud som ligger hos kunden og et utkast i
 * appen som ikke lenger ligner på det, er verre enn ingen historikk.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();

    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data: draft } = await admin
      .from("drafts")
      .select("id, lead_id, confirmed_at, sent_at, leads!inner(company_id)")
      .eq("id", id)
      .eq("leads.company_id", session.companyId)
      .maybeSingle();

    if (!draft) {
      return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
    }
    if (!draft.confirmed_at) {
      return NextResponse.json(
        { error: "Bekreft utkastet før du markerer det som sendt." },
        { status: 400 },
      );
    }
    // Allerede sendt er ikke en feil. Trykker de to ganger, eller har to faner
    // åpne, skal svaret være det samme.
    if (draft.sent_at) {
      return NextResponse.json({ ok: true, sent_at: draft.sent_at });
    }

    const naa = new Date().toISOString();
    const { error } = await admin
      .from("drafts")
      .update({ sent_at: naa })
      .eq("id", draft.id);
    if (error) throw new Error(error.message);

    await admin.from("leads").update({ status: "sendt" }).eq("id", draft.lead_id);

    return NextResponse.json({ ok: true, sent_at: naa });
  } catch (err) {
    return errorResponse(err);
  }
}
