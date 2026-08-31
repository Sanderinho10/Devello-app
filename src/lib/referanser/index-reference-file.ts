import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTags, normalizeTags } from "./index";
import type { QuoteType } from "@/lib/types";
import { anonymiser, anonymiserListe } from "@/lib/personvern/anonymiser";

/**
 * Skriver en opplastet referansefil inn i quote_references-poolen.
 *
 * Delt mellom opplastingsruta og engangsruta for eldre filer, så de to aldri
 * driver fra hverandre i hvordan en fil blir tagget og indeksert.
 *
 * Raden erstattes ved re-indeksering (delete + insert på reference_quote_id):
 * kjøres uthentingen på nytt med bedre tekst, skal det ikke ligge igjen en
 * gammel rad med dårligere tags ved siden av.
 */
export async function indexReferenceFile(
  admin: SupabaseClient,
  input: {
    companyId: string;
    referenceQuoteId: string;
    title: string;
    quoteType: QuoteType;
    extractedText: string;
  },
): Promise<{ tags: string[] }> {
  /**
   * Opplastede tilbud er gamle kundetilbud, med navn, adresser og
   * telefonnummer i klartekst. Vi vet ikke hvem kunden var — det står ingen
   * strukturerte felter å slå opp i — så her er det mønstrene som gjør
   * jobben. Se lib/personvern/anonymiser.
   */
  const tittel = anonymiser(input.title);
  const tekst = anonymiser(input.extractedText);

  const tagged = await extractTags(
    `Tittel: ${tittel}\nTilbudstype: ${input.quoteType}\n\n${tekst}`,
    { companyId: input.companyId, kind: "tagging_referansefil" },
  );
  const tags = normalizeTags(tagged.tags);
  const summary = anonymiser(tagged.summary);

  const searchText = [tittel, summary, tags.join(" "), tekst]
    .filter(Boolean)
    .join(" \n")
    .slice(0, 20_000);

  await admin
    .from("quote_references")
    .delete()
    .eq("reference_quote_id", input.referenceQuoteId);

  const { error } = await admin.from("quote_references").insert({
    company_id: input.companyId,
    reference_quote_id: input.referenceQuoteId,
    draft_id: null,
    lead_id: null,
    quote_type: input.quoteType,
    title: tittel,
    customer_type: tagged.customer_type === "ukjent" ? null : tagged.customer_type,
    tags,
    summary: summary || null,
    // Postene i en opplastet PDF er fri tekst, ikke strukturerte rader — vi
    // lar lines stå tom og lar fullteksten bære søket i stedet. Å gjette
    // struktur ut av en PDF ville gitt falsk presisjon.
    lines: [],
    // Forbeholdene fra fila fyller forbeholdsbiblioteket. Det er dette som
    // gjør at en ny kunde har noe å velge fra før første tilbud er bekreftet.
    assumptions: anonymiserListe(
      (tagged.forutsetninger ?? []).filter(
        (t) => typeof t === "string" && t.trim().length > 7,
      ),
    ),
    email_subject: null,
    email_body: null,
    subtotal_ex_vat: null,
    edited_by_user: false,
    search_text: searchText,
  });

  if (error) throw new Error(error.message);
  return { tags };
}
