import type { QuoteDocument } from "@/lib/types";

/**
 * Hvem tilbudet sendes til.
 *
 * Kunden i tilbudet først: den er valgt fra registeret eller rettet av et
 * menneske, og det er den som står i PDF-en. Avsenderen på henvendelsen er
 * reserven — et tilbud uten dokument (tid og materiell), eller et der
 * kunden ikke har e-post.
 *
 * Svar i tråden bare når mottakeren er den som skrev. Går tilbudet til en
 * annen, skal den ikke få med seg henvendelsen noen andre sendte.
 */
export function mottakerFor(
  lead: { source: string; from_email: string | null; from_name: string | null },
  document: QuoteDocument | null | undefined,
): { epost: string | null; navn: string | null; svarITraden: boolean } {
  const kunde = document?.customer;
  const kundeEpost = kunde?.email?.trim() || null;
  const avsender = lead.from_email?.trim() || null;
  const samme = !kundeEpost || (avsender !== null && kundeEpost.toLowerCase() === avsender.toLowerCase());
  if (samme) {
    return {
      epost: avsender ?? kundeEpost,
      navn: lead.from_name || kunde?.name?.trim() || null,
      svarITraden: lead.source === "epost" && avsender !== null,
    };
  }
  return { epost: kundeEpost, navn: kunde?.name?.trim() || null, svarITraden: false };
}
