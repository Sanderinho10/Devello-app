import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * «Kunden vil ha en justering.»
 *
 * Åpner et sendt tilbud som en ny versjon. Det som ble sendt, endres ikke: det
 * ligger i draft_versions som den endelige versjonen, med PDF-en den fikk. Det
 * som åpnes, er utkastet — det går videre som versjon 2, 3, … og får et nytt
 * løp gjennom bekreft og «Marker som sendt».
 *
 * En ordre låser det likevel. Da har kunden sagt ja til tilbudet, og ordren
 * har sin egen kopi av det. En ny versjon ved siden av ville gitt to svar på
 * hva som ble avtalt.
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
      .select(
        "id, lead_id, sent_at, revisjon, forrige_sendt_at, email_subject, leads!inner(company_id)",
      )
      .eq("id", id)
      .eq("leads.company_id", session.companyId)
      .maybeSingle();

    if (!draft) {
      return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
    }
    if (!draft.sent_at) {
      // Allerede åpnet — fra en annen fane, eller et dobbeltklikk. Samme svar.
      return NextResponse.json({
        ok: true,
        revisjon: draft.revisjon,
        forrige_sendt_at: draft.forrige_sendt_at,
        email_subject: draft.email_subject,
      });
    }

    const { data: ordre } = await admin
      .from("orders")
      .select("id")
      .eq("draft_id", draft.id)
      .maybeSingle();
    if (ordre) {
      return NextResponse.json(
        { error: "Tilbudet er gjort om til en ordre og kan ikke åpnes som ny versjon." },
        { status: 409 },
      );
    }

    const revisjon = draft.revisjon + 1;
    const emne = medVersjon(draft.email_subject, revisjon);

    // Betingelsen på sent_at og revisjon gjør at to trykk samtidig ikke gir
    // versjon 3: bare det første treffer raden.
    const { data: oppdatert, error } = await admin
      .from("drafts")
      .update({
        revisjon,
        forrige_sendt_at: draft.sent_at,
        sent_at: null,
        confirmed_at: null,
        // Kladden og PDF-en hører til versjonen som er sendt. PDF-en ligger
        // fortsatt i lagringen, og den endelige versjonen i loggen peker på den.
        outlook_draft_id: null,
        outlook_web_link: null,
        pdf_path: null,
        email_subject: emne,
      })
      .eq("id", draft.id)
      .eq("revisjon", draft.revisjon)
      .not("sent_at", "is", null)
      .select("revisjon, forrige_sendt_at, email_subject")
      .maybeSingle();
    if (error) throw new Error(error.message);

    await admin.from("leads").update({ status: "utkast_klar" }).eq("id", draft.lead_id);

    return NextResponse.json({
      ok: true,
      revisjon: oppdatert?.revisjon ?? revisjon,
      forrige_sendt_at: oppdatert?.forrige_sendt_at ?? draft.sent_at,
      email_subject: oppdatert?.email_subject ?? emne,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * «Tilbud på gulvvarme» → «Tilbud på gulvvarme (versjon 2)». Står det en
 * versjon der fra før, byttes den ut i stedet for å legges på en gang til.
 */
function medVersjon(emne: string, revisjon: number): string {
  const uten = emne.replace(/\s*\(versjon \d+\)\s*$/i, "").trim();
  return `${uten} (versjon ${revisjon})`;
}
