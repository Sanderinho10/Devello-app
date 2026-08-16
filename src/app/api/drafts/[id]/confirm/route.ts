import { NextResponse, type NextRequest } from "next/server";
import { attachPdf, createDraft } from "@/lib/graph/drafts";
import { accessTokenFor } from "@/lib/graph/oauth";
import { htmlToPdf } from "@/lib/pdf/render";
import { renderQuoteHtml } from "@/lib/pdf/template";
import { diffSnapshots, logDraftVersion } from "@/lib/drafts/versions";
import { saveQuoteReference } from "@/lib/referanser";
import { sessionOr401, errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hasDocument, type QuoteDocument, type QuoteType } from "@/lib/types";

export const maxDuration = 300;

/**
 * Bekreft-flyten.
 *
 * Punktpris/fastpris: dokumentet blir konvertert til PDF samtidig som kladden
 * opprettes i Outlook, med PDF-en vedlagt.
 * Tid og materiell: teksten går rett inn i kladden, ingen PDF.
 *
 * I begge tilfeller blir den endelige versjonen logget i draft_versions — uansett
 * om noe ble endret.
 *
 * Merk at vi aldri sender. Appen har ikke Mail.Send, og mennesket trykker send
 * selv fra Outlook.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const payload = (await request.json()) as {
    quote_type: QuoteType;
    email_subject: string;
    email_body: string;
    document: QuoteDocument | null;
  };

  const admin = supabaseAdmin();

  const { data: draft } = await admin
    .from("drafts")
    .select(
      "*, leads!inner(id, company_id, from_email, from_name, external_message_id, mailbox_connection_id, source, subject, body_text, body_preview)",
    )
    .eq("id", id)
    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    .eq("leads.company_id", session.companyId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
  }

  const lead = draft.leads as unknown as {
    id: string;
    source: "epost" | "manuell";
    from_email: string | null;
    from_name: string | null;
    external_message_id: string;
    mailbox_connection_id: string | null;
    subject: string | null;
    body_text: string | null;
    body_preview: string | null;
  };
  // En avklaringskladd har ikke noe dokument uansett type — leveransen er ett
  // avklaringsspørsmål i e-posten, og bekreft skal lage kladden uten PDF.
  const isClarification = draft.agent_status === "trenger_avklaring";
  const wantsDocument = !isClarification && hasDocument(payload.quote_type);

  if (wantsDocument && !payload.document) {
    return NextResponse.json(
      { error: "Tilbudstypen krever et dokument, men ingen ble sendt inn." },
      { status: 400 },
    );
  }

  try {
    const [{ data: company }, { data: brand }] = await Promise.all([
      admin.from("companies").select("name").eq("id", session.companyId).single(),
      admin
        .from("company_brand")
        .select("*")
        .eq("company_id", session.companyId)
        .maybeSingle(),
    ]);

    // 1. PDF — bare for punktpris og fastpris.
    let pdf: Buffer | null = null;
    let pdfPath: string | null = null;

    if (wantsDocument && payload.document) {
      const html = renderQuoteHtml({
        document: payload.document,
        quoteType: payload.quote_type,
        brand: brand ?? {},
        companyName: company!.name,
      });
      pdf = await htmlToPdf(html);

      pdfPath = `${session.companyId}/${draft.id}-${Date.now()}.pdf`;
      const { error: uploadError } = await admin.storage
        .from("quote-pdfs")
        .upload(pdfPath, pdf, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(`Kunne ikke lagre PDF: ${uploadError.message}`);
    }

    // 2. Outlook-kladd.
    //
    // Et manuelt lead har ingen postkasse på seg — det kom aldri inn via en.
    // Kladden skal likevel havne i selskapets Outlook, så vi slår opp den
    // aktive postkassen i stedet.
    const mailboxId = lead.mailbox_connection_id ?? (await activeMailboxId(session.companyId));
    if (!mailboxId) {
      throw new Error(
        "Ingen postkasse tilkoblet. Koble til Microsoft 365 under Innstillinger.",
      );
    }
    const token = await accessTokenFor(mailboxId);

    const outlook = await createDraft(token, {
      subject: payload.email_subject,
      body: payload.email_body,
      toEmail: lead.from_email,
      toName: lead.from_name,
      // Bare e-postleads har en melding å svare på. Den syntetiske id-en til
      // et manuelt lead ville fått createReply til å feile.
      replyToMessageId: lead.source === "epost" ? lead.external_message_id : null,
    });

    if (pdf) {
      await attachPdf(token, outlook.id, pdfFileName(payload.document!), pdf);
    }

    // 3. Lagre og logg den endelige versjonen.
    const previous = {
      quote_type: draft.quote_type as QuoteType,
      email_subject: draft.email_subject,
      email_body: draft.email_body,
      document: draft.document as QuoteDocument | null,
    };
    const final = {
      quote_type: payload.quote_type,
      email_subject: payload.email_subject,
      email_body: payload.email_body,
      document: wantsDocument ? payload.document : null,
    };

    await admin
      .from("drafts")
      .update({
        ...final,
        pdf_path: pdfPath,
        outlook_draft_id: outlook.id,
        outlook_web_link: outlook.webLink,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", draft.id);

    await logDraftVersion(admin, {
      draftId: draft.id,
      source: "endelig",
      snapshot: final,
      previous,
      userId: session.userId,
    });

    await admin.from("leads").update({ status: "bekrefta" }).eq("id", lead.id);

    // 4. Referanselisten — agentens hukommelse. Brukerens endelige versjon,
    // tagget med nøkkelord, så neste generering kan finne den igjen.
    // Skal aldri velte en bekreftelse: kladden er allerede opprettet.
    try {
      if (!isClarification) await saveQuoteReference(admin, {
        companyId: session.companyId,
        draftId: draft.id,
        leadId: lead.id,
        quoteType: payload.quote_type,
        leadText: [lead.subject, lead.body_text || lead.body_preview]
          .filter(Boolean)
          .join("\n\n"),
        emailSubject: payload.email_subject,
        emailBody: payload.email_body,
        document: final.document,
        editedByUser: Object.keys(diffSnapshots(previous, final)).length > 0,
      });
    } catch (err) {
      console.error("Kunne ikke skrive til referanselisten:", err);
    }

    return NextResponse.json({
      ok: true,
      web_link: outlook.webLink,
      pdf_path: pdfPath,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function pdfFileName(document: QuoteDocument): string {
  const slug = document.title
    .toLowerCase()
    .replace(/[æå]/g, "a")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `tilbud-${slug || "dokument"}.pdf`;
}

/** Selskapets aktive postkasse — brukt når leadet ikke bærer en selv. */
async function activeMailboxId(companyId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("mailbox_connections")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "aktiv")
    .maybeSingle();
  return data?.id ?? null;
}
