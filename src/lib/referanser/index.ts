import type { SupabaseClient } from "@supabase/supabase-js";
import { structured } from "@/lib/claude/client";
import { computeTotals, type QuoteDocument, type QuoteType } from "@/lib/types";

/**
 * Referanselisten — agentens hukommelse.
 *
 * Skrives ved «Bekreft og lag kladd» med brukerens ENDELIGE versjon, tagget
 * med nøkkelord. Leses ved generering: de 3–5 mest relevante tidligere
 * tilbudene går inn i konteksten som mønster for mengder, forutsetninger og
 * tone. Prisene kommer fortsatt bare fra prisfilen.
 *
 * Speiler devello-agent/referanseliste/LES_MEG.md og plattform-verktoy.md
 * (verktøy 1: sok_referanser).
 */

export interface ReferenceLine {
  beskrivelse: string;
  antall: number | null;
  enhet: string;
  enhetspris_eks_mva: number;
}

export interface QuoteReference {
  id: string;
  quote_type: QuoteType;
  title: string;
  customer_type: "forbruker" | "bedrift" | null;
  tags: string[];
  summary: string | null;
  lines: ReferenceLine[];
  assumptions: string[];
  email_subject: string | null;
  email_body: string | null;
  subtotal_ex_vat: number | null;
  edited_by_user: boolean;
  /** Hva brukeren rettet på før tilbudet gikk ut. */
  edit_summary: string | null;
  outcome: "vunnet" | "tapt" | null;
  confirmed_at: string;
}

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

export interface TagResult {
  tags: string[];
  summary: string;
  customer_type: "forbruker" | "bedrift" | "ukjent";
  /** Forbehold hentet ordrett ut av teksten. Fyller forbeholdsbiblioteket. */
  forutsetninger: string[];
}

const TAG_SCHEMA = {
  type: "object",
  properties: {
    // NB: ingen minItems/maxItems her — structured outputs støtter ikke
    // array-begrensninger og avviser hele skjemaet. Antallet styres av
    // beskrivelsen + normalizeTags().
    tags: {
      type: "array",
      items: { type: "string" },
      description:
        "3–8 nøkkelord for gjenfinning: jobbtype, komponenter, romtype, bygningstype. Små bokstaver, ubestemt entall, bokmål. F.eks. «elbillader», «sikringsskap», «bad», «garasje», «enebolig», «ny kurs», «feilsøking».",
    },
    summary: {
      type: "string",
      description: "1–2 setninger på bokmål om hva jobben var. Ingen priser.",
    },
    customer_type: { type: "string", enum: ["forbruker", "bedrift", "ukjent"] },
    forutsetninger: {
      type: "array",
      items: { type: "string" },
      description:
        "Forbehold og faste betingelser som står i teksten, ordrett slik firmaet skrev dem. F.eks. «Prisen forutsetter at det er strøm på stedet», «Stillas kommer i tillegg». Ta bare med det som gjelder generelt — ikke tall og mengder for denne ene jobben. Tom liste når teksten ikke har noen.",
    },
  },
  required: ["tags", "summary", "customer_type", "forutsetninger"],
  additionalProperties: false,
};

const TAG_SYSTEM = `Du tagger håndverkstilbud for gjenfinning. Svar bare med JSON etter skjemaet.
Nøkkelordene skal være de ordene en fagperson ville søkt på for å finne igjen
akkurat denne typen jobb senere. Normaliser: små bokstaver, ubestemt entall,
bokmål («stikkontakt», ikke «stikkontaktar» eller «Stikkontakter»). Ta med
komponent (elbillader, sikringsskap, downlight), rom/sted (bad, garasje,
kjellerstue), bygningstype (enebolig, rekkehus, næringslokale) og jobbart
(nyinstallasjon, oppgradering, feilsøking) når det framgår.`;

/**
 * Trekker ut tags + kort sammendrag fra en tekst (et lead eller et bekreftet
 * tilbud). Brukes både ved lagring (tagge tilbudet) og ved generering (tagge
 * leadet, så vi vet hva vi skal søke etter).
 */
export async function extractTags(text: string): Promise<TagResult> {
  return structured<TagResult>({
    system: TAG_SYSTEM,
    schema: TAG_SCHEMA,
    effort: "low",
    maxTokens: 1500,
    prompt: text.slice(0, 6000),
  });
}

// ---------------------------------------------------------------------------
// Skriv ved bekreft
// ---------------------------------------------------------------------------

export async function saveQuoteReference(
  admin: SupabaseClient,
  input: {
    companyId: string;
    draftId: string;
    leadId: string;
    quoteType: QuoteType;
    leadText: string;
    emailSubject: string;
    emailBody: string;
    document: QuoteDocument | null;
    editedByUser: boolean;
    /** Hva brukeren endret. Går inn i prompten sammen med referansen. */
    editSummary?: string | null;
  },
): Promise<void> {
  const lines: ReferenceLine[] = input.document
    ? input.document.sections.flatMap((s) =>
        s.lines.map((l) => ({
          beskrivelse: l.description,
          antall: l.quantity,
          enhet: l.unit,
          enhetspris_eks_mva: l.unit_price,
        })),
      )
    : [];

  const title =
    input.document?.title?.trim() || input.emailSubject.trim() || "Tilbud";

  // Tagg ut fra det som faktisk ble sendt (endelig versjon) + leadet.
  const tagSource = [
    `Tittel: ${title}`,
    `Tilbudstype: ${input.quoteType}`,
    lines.length ? `Poster:\n${lines.map((l) => `- ${l.beskrivelse}`).join("\n")}` : "",
    `Forespørselen:\n${input.leadText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let tagged: TagResult;
  try {
    tagged = await extractTags(tagSource);
  } catch (err) {
    // Tagging skal aldri stoppe en bekreftelse. Lagre uten tags heller enn å
    // feile — men en rad uten tags er nesten usøkbar, så feilen skal i loggen.
    console.warn("tagging av referanse feilet:", err instanceof Error ? err.message : err);
    tagged = { tags: [], summary: "", customer_type: "ukjent", forutsetninger: [] };
  }

  const tags = normalizeTags(tagged.tags);
  const searchText = [
    title,
    tagged.summary,
    tags.join(" "),
    lines.map((l) => l.beskrivelse).join(" "),
    ...(input.document?.assumptions ?? []),
  ]
    .filter(Boolean)
    .join(" \n");

  await admin.from("quote_references").insert({
    company_id: input.companyId,
    draft_id: input.draftId,
    lead_id: input.leadId,
    quote_type: input.quoteType,
    title,
    customer_type: tagged.customer_type === "ukjent" ? null : tagged.customer_type,
    tags,
    summary: tagged.summary || null,
    lines,
    assumptions: input.document?.assumptions ?? [],
    email_subject: input.emailSubject,
    email_body: input.emailBody,
    subtotal_ex_vat: input.document ? computeTotals(input.document).subtotal : null,
    edited_by_user: input.editedByUser,
    edit_summary: input.editSummary ?? null,
    search_text: searchText,
  });
}

// ---------------------------------------------------------------------------
// Søk ved generering
// ---------------------------------------------------------------------------

/**
 * De 3–5 mest relevante tidligere tilbudene for et lead. Tenant-ID kommer
 * alltid fra sesjonen i backend, aldri fra modellen.
 */
export async function findSimilarReferences(
  admin: SupabaseClient,
  input: {
    companyId: string;
    leadText: string;
    quoteType?: QuoteType | null;
    limit?: number;
  },
): Promise<{ references: QuoteReference[]; leadTags: string[] }> {
  let leadTags: string[] = [];
  try {
    leadTags = normalizeTags((await extractTags(input.leadText)).tags);
  } catch (err) {
    console.warn("tagging av lead feilet:", err instanceof Error ? err.message : err);
    leadTags = [];
  }

  // «or» mellom taggene: websearch_to_tsquery AND-er ord som står ved siden av
  // hverandre, og et lead deler sjelden ALLE nøkkelord med en referanse — ett
  // godt treff («elbillader») skal være nok. Rangeringen sorterer resten.
  const query = leadTags.length ? leadTags.join(" or ") : input.leadText.slice(0, 300);

  const { data, error } = await admin.rpc("sok_referanser", {
    p_company_id: input.companyId,
    p_query: query,
    p_quote_type: input.quoteType ?? null,
    p_limit: input.limit ?? 5,
  });
  if (error) {
    // Referanser er en forbedring, ikke en forutsetning. Uten dem genererer vi
    // som før — men vi vil vite om det i loggen.
    console.error("sok_referanser feilet:", error.message);
    return { references: [], leadTags };
  }
  return { references: (data ?? []) as QuoteReference[], leadTags };
}

/**
 * Kompakt tekstblokk til prompten. Aldri hele PDF-er — bare det agenten
 * trenger for å gjenkjenne mønsteret.
 */
export function referencesBlock(refs: QuoteReference[]): string {
  if (refs.length === 0) {
    return "# Tidligere bekreftede tilbud\n\n(ingen lignende funnet ennå — dette er blant de første)";
  }
  const items = refs.map((r, i) => {
    const head = `## ${i + 1}. [${r.quote_type}] ${r.title} (${r.confirmed_at.slice(0, 10)}${r.outcome ? `, ${r.outcome}` : ""}${r.edited_by_user ? ", redigert av bruker før sending" : ""})`;
    const parts = [head];
    if (r.tags.length) parts.push(`Nøkkelord: ${r.tags.join(", ")}`);
    if (r.summary) parts.push(`Jobb: ${r.summary}`);
    if (r.lines.length) {
      parts.push(
        "Poster:\n" +
          r.lines
            .map(
              (l) =>
                `- ${l.beskrivelse}${l.antall != null ? ` × ${l.antall} ${l.enhet}` : ""} à ${l.enhetspris_eks_mva} kr`,
            )
            .join("\n"),
      );
    }
    if (r.assumptions.length) {
      parts.push("Forutsetninger:\n" + r.assumptions.map((a) => `- ${a}`).join("\n"));
    }
    // Rettelsen er ofte mer lærerik enn selve tilbudet: den viser hva forrige
    // utkast bommet på.
    if (r.edit_summary) parts.push(`Rettet før sending: ${r.edit_summary}`);
    return parts.join("\n");
  });
  return [
    "# Tidligere bekreftede tilbud som ligner",
    "",
    "Bruk disse som mønster for mengder, forutsetninger, ordlyd og tone — det er",
    "slik dette firmaet faktisk sender tilbud. Prisene i det nye tilbudet skal",
    "likevel alltid slås opp i prisfilen, aldri kopieres herfra.",
    "",
    ...items,
  ].join("\n\n");
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.toLowerCase().trim().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 40 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}
