import { NextResponse, type NextRequest } from "next/server";
import { htmlToPdf } from "@/lib/pdf/render";
import { logoDataUri } from "@/lib/pdf/logo";
import { renderQuoteHtml } from "@/lib/pdf/template";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDocument, type QuoteDocument, type QuoteType } from "@/lib/types";

export const maxDuration = 120;

/** Forhåndsvisning av PDF-en. Samme mal som bekreft-flyten bruker. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const admin = supabaseAdmin();

  // Utkastet arver company via leadet, så vi må slå det opp for å sjekke tilgang.
  const { data: draft } = await admin
    .from("drafts")
    .select("id, quote_type, document, lead_id, leads!inner(company_id)")
    .eq("id", id)
    .eq("leads.company_id", session.companyId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
  }

  const quoteType = draft.quote_type as QuoteType;
  if (!hasDocument(quoteType) || !draft.document) {
    return NextResponse.json(
      { error: "Denne tilbudstypen har ikke noe dokument." },
      { status: 400 },
    );
  }

  const [{ data: company }, { data: brand }] = await Promise.all([
    admin.from("companies").select("name").eq("id", session.companyId).single(),
    admin
      .from("company_brand")
      .select("*")
      .eq("company_id", session.companyId)
      .maybeSingle(),
  ]);

  // Uten dette blir en feil i PDF-motoren til en Next-feilside i en ny fane,
  // og brukeren sitter igjen med en tom rute uten forklaring.
  try {
    const pdf = await htmlToPdf(
      renderQuoteHtml({
        document: draft.document as QuoteDocument,
        quoteType,
        brand: brand ?? {},
        companyName: company!.name,
        logoSrc: await logoDataUri(admin, brand?.logo_path),
      }),
    );

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="tilbud.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
