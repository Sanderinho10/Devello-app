import { graphFetch } from "./client";

/**
 * Opprettar ein kladd i Outlook. Aldri send.
 *
 * Merk: filvedlegg på kladdar fungerer fint her fordi vi kallar Graph direkte frå
 * vår eigen backend. Det er ikkje same avgrensing som i Claude sin M365-connector.
 */

interface CreateDraftInput {
  subject: string;
  body: string;
  toEmail: string | null;
  toName?: string | null;
  /** Svarar vi på ein tråd, held vi kladden i same samtale. */
  replyToMessageId?: string | null;
}

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
        body: { contentType: "HTML", content: textToHtml(input.body) },
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

  return { id: draft.id, webLink: draft.webLink };
}

/**
 * createReply gir oss ein kladd som ligg i den opphavlege tråden, med
 * mottakar og emne allereie sett. Så oppdaterer vi kroppen til vår tekst.
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
      body: { contentType: "HTML", content: textToHtml(input.body) },
    }),
  });

  return { id: draft.id, webLink: draft.webLink };
}

/** Legg ein PDF ved kladden. */
export async function attachPdf(
  accessToken: string,
  draftId: string,
  fileName: string,
  pdf: Buffer,
): Promise<void> {
  // Graph tek imot inline-vedlegg opp til ~3 MB. Over det må ein bruke
  // upload-session; ein tilbods-PDF er langt under grensa.
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
