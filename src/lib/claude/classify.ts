import { structured } from "./client";
import type { QuoteType, ReferenceQuote } from "@/lib/types";
import { referencesBlock, type QuoteReference } from "@/lib/referanser";

export interface Classification {
  quote_type: QuoteType;
  /** Kort begrunnelse, vist til brukeren over type-bryteren. */
  note: string;
  confidence: "hoeg" | "middels" | "laag";
}

const SCHEMA = {
  type: "object",
  properties: {
    quote_type: {
      type: "string",
      enum: ["punktpris", "fastpris", "tid_og_materiell"],
    },
    note: {
      type: "string",
      description:
        "Én til to setninger på bokmål om hvorfor denne typen passer, med referanse til liknende referansefiler når det finnes.",
    },
    confidence: { type: "string", enum: ["hoeg", "middels", "laag"] },
  },
  required: ["quote_type", "note", "confidence"],
  additionalProperties: false,
};

const SYSTEM = `Du klassifiserer innkommende jobbforespørsler for et norsk håndverksfirma.

De tre tilbudstypene:

- punktpris: Hver post har én buntet pris som dekker både arbeid og materiell
  (f.eks. "montering stikkontakt — 890 kr/stk"). Passer når jobben består av
  standardiserte enheter som kan telles.
- fastpris: Materiell og timer listes opp hver for seg og summeres til én
  total. Passer når jobben er avgrenset og lar seg spesifisere, men ikke består
  av standardiserte enheter.
- tid_og_materiell: Ingen fast pris. Løpende regning. Passer når omfanget er
  uklart — kunden beskriver et problem heller enn en definert jobb, eller det
  trengs befaring for å vite hva arbeidet faktisk innebærer.

Fasiten er hvilke typer referansetilbud kunden har lagt inn for liknende jobber,
og — når de finnes — hvilke typer firmaet faktisk har bekreftet og sendt for
liknende jobber tidligere (listen «Tidligere bekreftede tilbud»). Bekreftede
tilbud veier tyngst: de viser hva firmaet gjør i praksis.
Matcher jobbeskrivelsen en referanse, velger du samme type som referansen. Finnes
det ingen relevant referanse, velger du ut fra hvor godt definert omfanget er, og
setter confidence til laag.`;

export async function classifyQuoteType(input: {
  subject: string | null;
  body: string;
  references: Pick<ReferenceQuote, "title" | "type" | "job_description">[];
  /** Tidligere bekreftede tilbud som ligner (fra referanselisten). */
  similar?: QuoteReference[];
}): Promise<Classification> {
  // Referansefilene er filer merket med type. De fleste har bare et filnavn å
  // gå på — Jobb-linjen kommer bare med når den faktisk har innhold, så
  // modellen ikke matcher mot «(ikke beskrevet)» om og om igjen.
  const referenceBlock = input.references.length
    ? input.references
        .map((ref) => {
          const head = `- [${ref.type}] ${ref.title}`;
          return ref.job_description
            ? `${head}\n  Jobb: ${ref.job_description}`
            : head;
        })
        .join("\n")
    : "(ingen referansefiler lagt inn ennå)";

  return structured<Classification>({
    system: SYSTEM,
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 4000,
    prompt: `# Referansetilbud kunden har lagt inn

${referenceBlock}

${referencesBlock(input.similar ?? [])}

# Innkommende forespørsel

Emne: ${input.subject ?? "(uten emne)"}

${input.body}

---

Velg tilbudstype for denne forespørselen.`,
  });
}
