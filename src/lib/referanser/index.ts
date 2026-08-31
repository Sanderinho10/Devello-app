import type { SupabaseClient } from "@supabase/supabase-js";
import { structured } from "@/lib/claude/client";
import type { UsageContext } from "@/lib/billing/usage";
import { anonymiser, anonymiserListe } from "@/lib/personvern/anonymiser";
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
export async function extractTags(
  text: string,
  usage?: UsageContext,
): Promise<TagResult> {
  return structured<TagResult>({
    system: TAG_SYSTEM,
    schema: TAG_SCHEMA,
    effort: "low",
    maxTokens: 1500,
    // Ingen cachePrefix her. Taggeprompten er systemprompt på ~200 tokens og
    // en tekst som er ny hver gang — det finnes ikke noe stabilt prefiks å
    // lagre, og et bruddpunkt ville bare kostet skrivepremie uten treff.
    prompt: text.slice(0, 6000),
    usage,
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
    /**
     * Kunden slik den står på leadet. Brukes bare til å fjerne navnet og
     * adressen igjen — aldri til å lagre dem.
     */
    kunde?: { navn?: string | null; epost?: string | null };
  },
): Promise<void> {
  /**
   * Alt som skrives her går gjennom anonymiseringen.
   *
   * Referanselisten skal huske mønsteret — hvilke poster som hører sammen,
   * hvilke mengder som er vanlige, hvordan firmaet ordlegger seg. Ingenting
   * av det krever at kunden heter Halvard og bor i Eidsvågskogen 10. Utkastet
   * beholder de ekte opplysningene, for PDF-en må ha dem; læringsdataene
   * trenger dem aldri igjen.
   */
  const kjente = {
    navn: input.kunde?.navn ?? input.document?.customer.name,
    kontakt: input.document?.customer.contact,
    epost: input.kunde?.epost ?? input.document?.customer.email,
    telefon: input.document?.customer.phone,
    adresse: input.document?.customer.address,
  };
  const skjul = (t: string | null | undefined) => anonymiser(t, kjente);

  const lines: ReferenceLine[] = input.document
    ? input.document.sections.flatMap((s) =>
        s.lines.map((l) => ({
          beskrivelse: skjul(l.description),
          antall: l.quantity,
          enhet: l.unit,
          enhetspris_eks_mva: l.unit_price,
        })),
      )
    : [];

  const title = skjul(
    input.document?.title?.trim() || input.emailSubject.trim() || "Tilbud",
  );

  // Tagg ut fra det som faktisk ble sendt (endelig versjon) + leadet.
  const tagSource = [
    `Tittel: ${title}`,
    `Tilbudstype: ${input.quoteType}`,
    lines.length ? `Poster:\n${lines.map((l) => `- ${l.beskrivelse}`).join("\n")}` : "",
    // Også her: nøkkelordene blir de samme uten navnet, og da er det ingen
    // grunn til å sende det ut av huset.
    `Forespørselen:\n${skjul(input.leadText)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let tagged: TagResult;
  try {
    tagged = await extractTags(tagSource, {
      companyId: input.companyId,
      kind: "tagging_tilbud",
      leadId: input.leadId,
    });
  } catch (err) {
    // Tagging skal aldri stoppe en bekreftelse. Lagre uten tags heller enn å
    // feile — men en rad uten tags er nesten usøkbar, så feilen skal i loggen.
    console.warn("tagging av referanse feilet:", err instanceof Error ? err.message : err);
    tagged = { tags: [], summary: "", customer_type: "ukjent", forutsetninger: [] };
  }

  const tags = normalizeTags(tagged.tags);
  const summary = skjul(tagged.summary);
  const assumptions = anonymiserListe(input.document?.assumptions ?? [], kjente);
  const emailSubject = skjul(input.emailSubject);
  const emailBody = skjul(input.emailBody);

  const searchText = [
    title,
    summary,
    tags.join(" "),
    lines.map((l) => l.beskrivelse).join(" "),
    ...assumptions,
  ]
    .filter(Boolean)
    .join(" \n");

  // Upsert, ikke insert. Bekreft kan trykkes flere ganger — retter man en
  // linje og bekrefter på nytt, skal referansen oppdateres, ikke bli til en
  // rad til. To rader for samme tilbud ville telt dobbelt i mønsteret agenten
  // leser av. Se 0028.
  await admin.from("quote_references").upsert(
    {
      company_id: input.companyId,
      draft_id: input.draftId,
      lead_id: input.leadId,
      quote_type: input.quoteType,
      title,
      customer_type: tagged.customer_type === "ukjent" ? null : tagged.customer_type,
      tags,
      summary: summary || null,
      lines,
      assumptions,
      email_subject: emailSubject,
      email_body: emailBody,
      subtotal_ex_vat: input.document ? computeTotals(input.document).subtotal : null,
      edited_by_user: input.editedByUser,
      edit_summary: skjul(input.editSummary) || null,
      search_text: searchText,
    },
    { onConflict: "draft_id" },
  );
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
    /** Leadet, for kost per tilbud i model_usage. */
    leadId?: string | null;
  },
): Promise<{ references: QuoteReference[]; leadTags: string[] }> {
  let leadTags: string[] = [];
  try {
    leadTags = normalizeTags(
      (
        await extractTags(input.leadText, {
          companyId: input.companyId,
          kind: "tagging_lead",
          leadId: input.leadId ?? null,
        })
      ).tags,
    );
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
      // Uten priser, med vilje. Referansen skal vise HVILKE poster firmaet
      // tar med og i hvilke mengder — det er mønsteret agenten skal kjenne
      // igjen. Prisen slås opp i prisfilen hver gang, og et gammelt beløp i
      // konteksten er bare en invitasjon til å gjenbruke det. Særlig når
      // beløpet kan være en manuell overstyring for én jobb.
      parts.push(
        "Poster:\n" +
          r.lines
            .map(
              (l) =>
                `- ${l.beskrivelse}${l.antall != null ? ` × ${l.antall} ${l.enhet}` : ""}`,
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
    // Én streng, ikke fire: listen under blir slått sammen med blanke linjer
    // mellom hvert element, og delt opp ville avsnittet fått en blank linje
    // mellom hver setning.
    [
      "Bruk disse som mønster for hvilke poster som hører med, hvilke mengder",
      "som er vanlige, og hvilken ordlyd og tone firmaet bruker — det er slik",
      "de faktisk sender tilbud. Beløp står ikke her: prisen slås opp i",
      "prisfilen hver gang, aldri hentet fra et tidligere tilbud.",
    ].join("\n"),
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
