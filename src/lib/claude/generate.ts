import { structured } from "./client";
import { loadSop } from "./sop";
import type {
  Company,
  Lead,
  PriceListItem,
  QuoteDocument,
  QuoteType,
} from "@/lib/types";

export interface GeneratedDraft {
  email_subject: string;
  email_body: string;
  document: QuoteDocument | null;
}

/**
 * Modellen velger *hvilke* poster som skal med og *hvor mange*. Den slår aldri
 * opp prisen selv — den peker på en price_item_id, og vi fyller inn enhetspris
 * og enhet fra prisfilen etterpå. Derfor er unit_price ikke med i skjemaet.
 */
const LINE_SCHEMA = {
  type: "object",
  properties: {
    price_item_id: {
      type: "string",
      description: "id fra prisfilen. Må være en av de oppgitte id-ene.",
    },
    description: {
      type: "string",
      description:
        "Postteksten slik den skal stå i tilbudet. Ta utgangspunkt i navnet fra prisfilen, men gjør den konkret for denne jobben.",
    },
    quantity: { type: "number", description: "Antall enheter." },
  },
  required: ["price_item_id", "description", "quantity"],
  additionalProperties: false,
};

const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    email_subject: { type: "string" },
    email_body: { type: "string" },
    document: {
      type: "object",
      properties: {
        customer: {
          type: "object",
          properties: {
            name: { type: "string" },
            contact: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            address: { type: ["string", "null"] },
          },
          required: ["name", "contact", "email", "phone", "address"],
          additionalProperties: false,
        },
        title: { type: "string" },
        intro: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              lines: { type: "array", items: LINE_SCHEMA },
            },
            required: ["title", "lines"],
            additionalProperties: false,
          },
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
          description:
            "Hva prisen bygger på, og hva som kommer i tillegg hvis jobben krever mer materiell eller tid enn spesifisert.",
        },
      },
      required: ["customer", "title", "intro", "sections", "assumptions"],
      additionalProperties: false,
    },
  },
  required: ["email_subject", "email_body", "document"],
  additionalProperties: false,
};

const TEXT_SCHEMA = {
  type: "object",
  properties: {
    email_subject: { type: "string" },
    email_body: { type: "string" },
  },
  required: ["email_subject", "email_body"],
  additionalProperties: false,
};

interface GenerateInput {
  quoteType: QuoteType;
  lead: Pick<Lead, "subject" | "body_text" | "from_name" | "from_email">;
  company: Pick<Company, "name" | "tone_settings">;
  priceItems: PriceListItem[];
  /** Standard mva-sats. */
  vatRate?: number;
}

export async function generateDraft(
  input: GenerateInput,
): Promise<GeneratedDraft> {
  return input.quoteType === "tid_og_materiell"
    ? generateTextOnly(input)
    : generateWithDocument(input);
}

// ---------------------------------------------------------------------------
// Punktpris / fastpris: strukturert dokument + kort standard e-posttekst
// ---------------------------------------------------------------------------

async function generateWithDocument(
  input: GenerateInput,
): Promise<GeneratedDraft> {
  const relevant = relevantPriceItems(input.quoteType, input.priceItems);
  if (relevant.length === 0) {
    throw new Error(
      `Prisfilen har ingen rader som passer tilbudstypen «${input.quoteType}». Legg inn prisrader under Prisfil før du genererer.`,
    );
  }

  const sop = await loadSop();

  const raw = await structured<{
    email_subject: string;
    email_body: string;
    document: {
      customer: QuoteDocument["customer"];
      title: string;
      intro: string;
      sections: {
        title: string;
        lines: { price_item_id: string; description: string; quantity: number }[];
      }[];
      assumptions: string[];
    };
  }>({
    system: documentSystem(input.quoteType, sop),
    schema: DOCUMENT_SCHEMA,
    prompt: [
      priceListBlock(relevant),
      companyBlock(input.company),
      leadBlock(input.lead),
      "---",
      `Lag et ${input.quoteType}-tilbud for denne forespørselen.`,
    ].join("\n\n"),
  });

  // Prisene kommer herfra, ikke fra modellen.
  const byId = new Map(relevant.map((item) => [item.id, item]));
  const sections = raw.document.sections.map((section) => ({
    title: section.title,
    lines: section.lines.flatMap((line) => {
      const item = byId.get(line.price_item_id);
      // Fant modellen på en id, dropper vi raden heller enn å gjette en pris.
      if (!item) return [];
      return [
        {
          price_item_id: item.id,
          description: line.description || item.name,
          quantity: line.quantity,
          unit: item.unit,
          unit_price: Number(item.unit_price),
        },
      ];
    }),
  }));

  const document: QuoteDocument = {
    customer: raw.document.customer,
    title: raw.document.title,
    intro: raw.document.intro,
    sections,
    assumptions: raw.document.assumptions,
    valid_until: thirtyDaysFromNow(),
    vat_rate: input.vatRate ?? 25,
  };

  return {
    email_subject: raw.email_subject,
    email_body: raw.email_body,
    document,
  };
}

// ---------------------------------------------------------------------------
// Tid og materiell: bare tekst, ingen dokument
// ---------------------------------------------------------------------------

async function generateTextOnly(
  input: GenerateInput,
): Promise<GeneratedDraft> {
  const sop = await loadSop();
  const rates = input.priceItems.filter((item) => item.kind === "time" && item.active);

  const raw = await structured<{ email_subject: string; email_body: string }>({
    system: `Du skriver tilbuds-e-poster for et norsk håndverksfirma.

Dette er et tilbud på tid og materiell — løpende regning. Det skal IKKE lages
noe dokument eller vedlegg. Hele tilbudet ligger i e-postteksten.

Timepriser og eventuelle faste tillegg står i prisfilen under. Bruk tallene
derfra ordrett. Regn aldri ut noe selv, og finn aldri på en pris som ikke står
der.

Følg SOP-en under for hva teksten skal inneholde.

# SOP

${sop}`,
    schema: TEXT_SCHEMA,
    maxTokens: 8000,
    prompt: [
      rates.length
        ? priceListBlock(rates)
        : "# Prisfil\n\n(ingen timepriser lagt inn — skriv teksten uten konkrete satser og be kunden om en prat)",
      companyBlock(input.company),
      leadBlock(input.lead),
      "---",
      "Skriv e-postteksten for et tilbud på tid og materiell.",
    ].join("\n\n"),
  });

  return { ...raw, document: null };
}

// ---------------------------------------------------------------------------
// Prompt-byggere
// ---------------------------------------------------------------------------

function documentSystem(quoteType: QuoteType, sop: string): string {
  const typeRules =
    quoteType === "punktpris"
      ? `Dette er et PUNKTPRIS-tilbud. Hver post har én buntet pris som dekker både
arbeid og materiell. Bruk bare prisrader av typen «punktpris». Legg alle postene
i én seksjon.`
      : `Dette er et FASTPRIS-tilbud. Materiell og timer skal listes hver for seg og
summeres til én total. Lag to seksjoner: «Materiell» (prisrader av typen
materiell) og «Arbeid» (prisrader av typen time).

Poenget med å spesifisere er å vise hva som ville komme i tillegg hvis jobben
krever mer materiell eller tid enn spesifisert. Skriv derfor forutsetningene
(assumptions) konkret: hvilke mengder og hvilket timetall prisen bygger på, og
hva som utløser tillegg.`;

  return `Du lager tilbud for et norsk håndverksfirma. Skriv på bokmål.

${typeRules}

Absolutte regler:
- Bruk bare poster fra prisfilen under. Hver linje må peke på en price_item_id
  som faktisk står i listen.
- Du skal ALDRI regne ut priser, summer eller totaler. Du oppgir bare hvilken
  post og hvor mange enheter. Systemet slår opp enhetsprisen og regner summene.
- Finner du ingen passende post for noe kunden har spurt om, la det stå utenfor
  tilbudet og nevn det i forutsetningene i stedet.
- Mengder skal begrunnes ut fra det kunden faktisk har skrevet. Ikke gjett vilt —
  er mengden uklar, bruk et forsiktig anslag og skriv det i forutsetningene.

E-postteksten skal være kort. Den følger med som melding når PDF-en blir lagt
ved, så selve tilbudet skal ikke gjentas i teksten.

# SOP for e-postteksten

${sop}`;
}

function priceListBlock(items: PriceListItem[]): string {
  const rows = items
    .map((item) => {
      const parts = [
        `- id: ${item.id}`,
        `  navn: ${item.name}`,
        `  type: ${item.kind}`,
        `  enhet: ${item.unit}`,
        `  enhetspris: ${item.unit_price} kr`,
      ];
      if (item.code) parts.push(`  kode: ${item.code}`);
      if (item.description) parts.push(`  beskrivelse: ${item.description}`);
      return parts.join("\n");
    })
    .join("\n");
  return `# Prisfil\n\n${rows}`;
}

function companyBlock(company: GenerateInput["company"]): string {
  const tone = company.tone_settings ?? {};
  const lines = [`Firma: ${company.name}`];
  if (tone.formalitet) lines.push(`Tiltaleform: ${tone.formalitet}`);
  if (tone.signatur) lines.push(`Signatur:\n${tone.signatur}`);
  if (tone.tillegg) lines.push(`Tilleggsinstruks: ${tone.tillegg}`);
  return `# Avsender\n\n${lines.join("\n")}`;
}

function leadBlock(lead: GenerateInput["lead"]): string {
  return `# Forespørselen

Fra: ${lead.from_name ?? "(ukjent)"} <${lead.from_email ?? "ukjent"}>
Emne: ${lead.subject ?? "(uten emne)"}

${lead.body_text ?? ""}`;
}

function relevantPriceItems(
  quoteType: QuoteType,
  items: PriceListItem[],
): PriceListItem[] {
  const active = items.filter((item) => item.active);
  if (quoteType === "punktpris") {
    return active.filter((item) => item.kind === "punktpris");
  }
  return active.filter((item) => item.kind === "materiell" || item.kind === "time");
}

function thirtyDaysFromNow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}
