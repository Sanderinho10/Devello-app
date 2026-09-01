import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Sletter et lead med alt som hører til: utkastet, versjonsloggen,
 * referanseraden og PDF-en i lagringen. Borte er borte — en «myk» sletting
 * som lar dataene ligge igjen ville gjort anonymiseringen og slettingen vi
 * lover, til en løgn.
 *
 * Et sendt tilbud kan ikke slettes. Arkivet er historikken over hva kunden
 * faktisk har fått, og et arkiv man kan slette fra er ikke en historikk.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();

    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data: lead } = await admin
      .from("leads")
      .select("id, status, drafts(id, pdf_path, sent_at)")
      .eq("id", id)
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: "Fant ikke leadet" }, { status: 404 });
    }

    const draft = (lead.drafts as unknown as { id: string; pdf_path: string | null; sent_at: string | null }[])?.[0];

    if (draft?.sent_at) {
      return NextResponse.json(
        { error: "Tilbudet er sendt og kan ikke slettes. Arkivet er historikken." },
        { status: 409 },
      );
    }

    // Referanseraden peker på leadet med «on delete set null» — den ville
    // blitt liggende igjen som læringsdata for et tilbud som ikke finnes.
    // Når mennesket sier at utkastet skal bort, skal agenten heller ikke
    // huske det.
    await admin.from("quote_references").delete().eq("lead_id", lead.id);

    // PDF-en i lagringen har ingen kobling som rydder den.
    if (draft?.pdf_path) {
      await admin.storage.from("quote-pdfs").remove([draft.pdf_path]);
    }

    // Leadet til slutt — utkast og versjonslogg følger med på kjøpet
    // (on delete cascade). Forbruksraden i usage_events blir stående med
    // vilje: genereringen skjedde og kostet det den kostet, og en teller man
    // kan slette seg under, er ingen teller.
    const { error } = await admin.from("leads").delete().eq("id", lead.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
