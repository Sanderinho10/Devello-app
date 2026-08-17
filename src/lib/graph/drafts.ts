import { graphFetch } from "./client";

/**
 * Oppretter en kladd i Outlook. Aldri send.
 *
 * Merk: filvedlegg på kladder fungerer fint her fordi vi kaller Graph direkte fra
 * vår egen backend. Det er ikke samme begrensningen som i Claudes M365-connector.
 */

interface CreateDraftInput {
  subject: string;
  body: string;
  toEmail: string | null;
  toName?: string | null;
  /** Svarer vi på en tråd, holder vi kladden i samme samtale. */
  replyToMessageId?: string | null;
  /** Bildet nederst i signaturen, om firmaet har lagt inn et. */
  signatureImage?: SignatureImage | null;
}

export interface SignatureImage {
  bytes: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * Bildet må ligge som et inline-vedlegg og refereres med cid:, ikke som en
 * lenke til oss. En lenke ville krevd at bildet lå åpent på nettet, og de
 * fleste e-postklienter blokkerer eksterne bilder uansett — mottakeren ville
 * sett et tomt felt der logoen skulle stått. cid: er slik Outlook selv legger
 * inn signaturbilder.
 */
const SIGNATUR_CID = "devello-signatur";

export interface OutlookDraft {
  id: string;
  webLink: string;
}

export async function createDraft(
  accessToken: string,
  input: CreateDraftInput,
): Promise<OutlookDraft> {
  if (input.replyToMessageId) {
    return createReplyDraft(accessToken, input, input.replyToMessageId);
  }

  const draft = await graphFetch<{ id: string; webLink: string }>(
    accessToken,
    "/me/messages",
    {
      method: "POST",
      body: JSON.stringify({
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: bodyHtml(input.body, input.signatureImage),
        },
        toRecipients: input.toEmail
          ? [
              {
                emailAddress: {
                  address: input.toEmail,
                  name: input.toName ?? undefined,
                },
              },
            ]
          : [],
      }),
    },
  );

  if (input.signatureImage) {
    await attachSignatureImage(accessToken, draft.id, input.signatureImage);
  }

  return { id: draft.id, webLink: draft.webLink };
}

/**
 * createReply gir oss en kladd som ligger i den opprinnelige tråden, med
 * mottaker og emne allerede satt. Så oppdaterer vi kroppen til vår tekst.
 */
async function createReplyDraft(
  accessToken: string,
  input: CreateDraftInput,
  replyToMessageId: string,
): Promise<OutlookDraft> {
  const draft = await graphFetch<{ id: string; webLink: string }>(
    accessToken,
    `/me/messages/${encodeURIComponent(replyToMessageId)}/createReply`,
    { method: "POST" },
  );

  await graphFetch(accessToken, `/me/messages/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: input.subject,
      body: {
        contentType: "HTML",
        content: bodyHtml(input.body, input.signatureImage),
      },
    }),
  });

  if (input.signatureImage) {
    await attachSignatureImage(accessToken, draft.id, input.signatureImage);
  }

  return { id: draft.id, webLink: draft.webLink };
}

/** Inline-vedlegget bildet i signaturen peker på. */
async function attachSignatureImage(
  accessToken: string,
  draftId: string,
  image: SignatureImage,
): Promise<void> {
  await graphFetch(accessToken, `/me/messages/${draftId}/attachments`, {
    method: "POST",
    body: JSON.stringify({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: image.fileName,
      contentType: image.contentType,
      contentBytes: image.bytes.toString("base64"),
      isInline: true,
      contentId: SIGNATUR_CID,
    }),
  });
}

function bodyHtml(text: string, signatureImage?: SignatureImage | null): string {
  const html = textToHtml(text);
  if (!signatureImage) return html;
  // Under signaturteksten agenten alt har skrevet.
  return `${html}\n<div style="margin-top:10px"><img src="cid:${SIGNATUR_CID}" alt="" style="max-height:90px"></div>`;
}

/** Legg en PDF ved kladden. */
export async function attachPdf(
  accessToken: string,
  draftId: string,
  fileName: string,
  pdf: Buffer,
): Promise<void> {
  // Graph tar imot inline-vedlegg opp til ~3 MB. Over det må man bruke
  // upload-session; en tilbuds-PDF er langt under grensen.
  const MAX_INLINE_BYTES = 3 * 1024 * 1024;
  if (pdf.byteLength > MAX_INLINE_BYTES) {
    throw new Error(
      `PDF-en er ${Math.round(pdf.byteLength / 1024)} kB — for stor for direkte vedlegg.`,
    );
  }

  await graphFetch(accessToken, `/me/messages/${draftId}/attachments`, {
    method: "POST",
    body: JSON.stringify({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: fileName,
      contentType: "application/pdf",
      contentBytes: pdf.toString("base64"),
    }),
  });
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#1d1d1f">${paragraphs}</div>`;
}
