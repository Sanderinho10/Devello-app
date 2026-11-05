import { NextResponse, type NextRequest } from "next/server";
import { htmlToPdf } from "@/lib/pdf/render";
import { logoDataUri } from "@/lib/pdf/logo";
import { renderQuoteHtml } from "@/lib/pdf/template";
import { kundenummerForLead } from "@/lib/kunder/koble";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentSendteVersjoner } from "@/lib/drafts/historikk";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDocument } from "@/lib/types";

export const maxDuration = 120;

/**
 * PDF-en for en sendt versjon av tilbudet.
 *
 * Det er filen som ble laget da versjonen ble bekreftet — den samme som ble
 * lagt ved e-posten til kunden. Bare for eldre tilbud, der stien til filen
 * ikke ble tatt vare på, lages den på nytt fra innholdet i versjonen.
 * Innholdet er det samme; logo og firmaadresse er dagens.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; revisjon: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, revisjon: revisjonTekst } = await params;
    const revisjon = Number(revisjonTekst);
    const admin = supabaseAdmin();

    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data: draft } = await admin
      .from("drafts")
      .select("id, lead_id, revisjon, sent_at, forrige_sendt_at, pdf_path, quote_no, leads!inner(company_id)")
      .eq("id", id)
      .eq("leads.company_id", session.companyId)
      .maybeSingle();
    if (!draft) {
      return NextResponse.json({ error: "Fant ikke tilbudet" }, { status: 404 });
    }

    const versjoner = await hentSendteVersjoner(admin, draft);
    const versjon = versjoner.find((v) => v.revisjon === revisjon);
    if (!versjon) {
      return NextResponse.json({ error: "Fant ikke denne versjonen" }, { status: 404 });
    }

    const navn = `tilbud${draft.quote_no ? `-${draft.quote_no}` : ""}${revisjon > 1 ? `-versjon-${revisjon}` : ""}.pdf`;
    const disposisjon = request.nextUrl.searchParams.get("last_ned") ? "attachment" : "inline";
    const svar = (body: BodyInit) =>
      new NextResponse(body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposisjon}; filename*=UTF-8''${encodeURIComponent(navn)}`,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
        },
      });

    if (versjon.pdfPath) {
      const { data: blob } = await admin.storage.from("quote-pdfs").download(versjon.pdfPath);
      if (blob) return svar(blob);
      // Filen er borte fra lagringen. Faller gjennom og lager den på nytt.
    }

    if (!hasDocument(versjon.quoteType) || !versjon.document) {
      return NextResponse.json(
        { error: "Denne versjonen har ingen PDF — den ble sendt som ren e-post." },
        { status: 404 },
      );
    }

    const forrige = versjoner.find((v) => v.revisjon === revisjon - 1);
    const [{ data: company }, { data: brand }] = await Promise.all([
      admin
        .from("companies")
        .select("name, billing_address_line, billing_postal_code, billing_city")
        .eq("id", session.companyId)
        .single(),
      admin.from("company_brand").select("*").eq("company_id", session.companyId).maybeSingle(),
    ]);

    const pdf = await htmlToPdf(
      renderQuoteHtml({
        document: versjon.document,
        quoteType: versjon.quoteType,
        brand: brand ?? {},
        companyName: company!.name,
        logoSrc: await logoDataUri(admin, brand?.logo_path),
        address: {
          line: company!.billing_address_line,
          postalCode: company!.billing_postal_code,
          city: company!.billing_city,
        },
        versjon: { nr: revisjon, erstatter: forrige?.sendtAt ?? null },
        tilbudsnr: draft.quote_no,
        kundenr: await kundenummerForLead(admin, draft.lead_id),
      }),
    );
    return svar(new Uint8Array(pdf));
  } catch (err) {
    return errorResponse(err);
  }
}
