import { NextResponse, type NextRequest } from "next/server";
import { htmlToPdf } from "@/lib/pdf/render";
import { renderQuoteHtml } from "@/lib/pdf/template";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDocument, type QuoteDocument, type QuoteType } from "@/lib/types";

export const maxDuration = 120;

/** Forhandsvisning av PDF-en. Same mal som bekreft-flyten brukar. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const admin = supabaseAdmin();

  // Utkastet arvar company via leadet, så vi må slå det opp for å sjekke tilgang.
  const { data: draft } = await admin
    .from("drafts")
    .select("id, quote_type, document, lead_id, leads!inner(company_id)")
    .eq("id", id)
    .eq("leads.company_id", session.companyId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Fann ikkje utkastet" }, { status: 404 });
  }

  const quoteType = draft.quote_type as QuoteType;
  if (!hasDocument(quoteType) || !draft.document) {
    return NextResponse.json(
      { error: "Denne tilbudstypen har ikkje noko dokument." },
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

  const pdf = await htmlToPdf(
    renderQuoteHtml({
      document: draft.document as QuoteDocument,
      quoteType,
      brand: brand ?? {},
      companyName: company!.name,
    }),
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="tilbod.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
