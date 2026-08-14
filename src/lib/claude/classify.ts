import { structured } from "./client";
import type { QuoteType, ReferenceQuote } from "@/lib/types";

export interface Classification {
  quote_type: QuoteType;
  /** Kort grunngiving, vist til brukaren over type-bryteren. */
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
        "Éi til to setningar på norsk om kvifor denne typen passar, med referanse til liknande referansefiler når det finst.",
    },
    confidence: { type: "string", enum: ["hoeg", "middels", "laag"] },
  },
  required: ["quote_type", "note", "confidence"],
  additionalProperties: false,
};

const SYSTEM = `Du klassifiserer innkommande jobbførespurnader for eit norsk handverksfirma.

Dei tre tilbudstypane:

- punktpris: Kvar post har éin bunta pris som dekker både arbeid og materiell
  (t.d. "montering stikkontakt — 890 kr/stk"). Passar når jobben består av
  standardiserte einingar som kan teljast.
- fastpris: Materiell og timar listast opp kvar for seg og summerast til éin
  total. Passar når jobben er avgrensa og lèt seg spesifisere, men ikkje består
  av standardiserte einingar.
- tid_og_materiell: Ingen fast pris. Løpande regning. Passar når omfanget er
  uklart — kunden skildrar eit problem heller enn ein definert jobb, eller det
  trengst befaring for å vite kva arbeidet faktisk inneber.

Fasiten er kva typar referansetilbod kunden har lagt inn for liknande jobbar.
Matchar jobbskildringa ein referanse, vel du same type som referansen. Finst det
ingen relevant referanse, vel du ut frå kor godt definert omfanget er, og set
confidence til laag.`;

export async function classifyQuoteType(input: {
  subject: string | null;
  body: string;
  references: Pick<ReferenceQuote, "title" | "type" | "job_description">[];
}): Promise<Classification> {
  const referenceBlock = input.references.length
    ? input.references
        .map(
          (ref) =>
            `- [${ref.type}] ${ref.title}\n  Jobb: ${ref.job_description ?? "(ikkje skildra)"}`,
        )
        .join("\n")
    : "(ingen referansefiler lagt inn enno)";

  return structured<Classification>({
    system: SYSTEM,
    schema: SCHEMA,
    effort: "medium",
    maxTokens: 4000,
    prompt: `# Referansetilbod kunden har lagt inn

${referenceBlock}

# Innkommande førespurnad

Emne: ${input.subject ?? "(utan emne)"}

${input.body}

---

Vel tilbudstype for denne førespurnaden.`,
  });
}
