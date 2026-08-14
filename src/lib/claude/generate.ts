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
 * Modellen vel *kva* postar som skal med og *kor mange*. Den slår aldri opp
 * prisen sjølv — den peikar på ein price_item_id, og vi fyller inn einingspris
 * og eining frå prisfila etterpå. Difor er unit_price ikkje med i skjemaet.
 */
const LINE_SCHEMA = {
  type: "object",
  properties: {
    price_item_id: {
      type: "string",
      description: "id frå prisfila. Må vere ein av dei oppgitte id-ane.",
    },
    description: {
      type: "string",
      description:
        "Postteksten slik den skal stå i tilbodet. Ta utgangspunkt i namnet frå prisfila, men gjer den konkret for denne jobben.",
    },
    quantity: { type: "number", description: "Antal einingar." },
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
            "Kva prisen byggjer på, og kva som kjem i tillegg dersom jobben krev meir materiell eller tid enn spesifisert.",
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
      `Prisfila har ingen rader som passar tilbudstypen «${input.quoteType}». Legg inn prisrader under Prisfil før du genererer.`,
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
      `Lag eit ${input.quoteType}-tilbod for denne førespurnaden.`,
    ].join("\n\n"),
  });

  // Prisane kjem herifrå, ikkje frå modellen.
  const byId = new Map(relevant.map((item) => [item.id, item]));
  const sections = raw.document.sections.map((section) => ({
    title: section.title,
    lines: section.lines.flatMap((line) => {
      const item = byId.get(line.price_item_id);
      // Fann modellen på ein id, droppar vi raden heller enn å gjette ein pris.
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
// Tid og materiell: berre tekst, ingen dokument
// ---------------------------------------------------------------------------

async function generateTextOnly(
  input: GenerateInput,
): Promise<GeneratedDraft> {
  const sop = await loadSop();
  const rates = input.priceItems.filter((item) => item.kind === "time" && item.active);

  const raw = await structured<{ email_subject: string; email_body: string }>({
    system: `Du skriv tilbods-e-postar for eit norsk handverksfirma.

Dette er eit tilbod på tid og materiell — løpande regning. Det skal IKKJE lagast
noko dokument eller vedlegg. Heile tilbodet ligg i e-postteksten.

Timeprisar og eventuelle faste tillegg står i prisfila under. Bruk tala derifrå
ordrett. Rekn aldri ut noko sjølv, og finn aldri på ein pris som ikkje står der.

Følg SOP-en under for kva teksten skal innehalde.

# SOP

${sop}`,
    schema: TEXT_SCHEMA,
    maxTokens: 8000,
    prompt: [
      rates.length
        ? priceListBlock(rates)
        : "# Prisfil\n\n(ingen timeprisar lagt inn — skriv teksten utan konkrete satsar og be kunden om ein prat)",
      companyBlock(input.company),
      leadBlock(input.lead),
      "---",
      "Skriv e-postteksten for eit tilbod på tid og materiell.",
    ].join("\n\n"),
  });

  return { ...raw, document: null };
}

// ---------------------------------------------------------------------------
// Prompt-byggjarar
// ---------------------------------------------------------------------------

function documentSystem(quoteType: QuoteType, sop: string): string {
  const typeRules =
    quoteType === "punktpris"
      ? `Dette er eit PUNKTPRIS-tilbod. Kvar post har éin bunta pris som dekker både
arbeid og materiell. Bruk berre prisrader av typen «punktpris». Legg alle postane
i éin seksjon.`
      : `Dette er eit FASTPRIS-tilbod. Materiell og timar skal listast kvar for seg og
summerast til éin total. Lag to seksjonar: «Materiell» (prisrader av typen
materiell) og «Arbeid» (prisrader av typen time).

Poenget med å spesifisere er å vise kva som ville kome i tillegg dersom jobben
krev meir materiell eller tid enn spesifisert. Skriv difor føresetnadene
(assumptions) konkret: kva mengder og timetal prisen byggjer på, og kva som
utløyser tillegg.`;

  return `Du lagar tilbod for eit norsk handverksfirma.

${typeRules}

Absolutte reglar:
- Bruk berre postar frå prisfila under. Kvar linje må peike på ein price_item_id
  som faktisk står i lista.
- Du skal ALDRI rekne ut prisar, summar eller totalar. Du oppgir berre kva post
  og kor mange einingar. Systemet slår opp einingsprisen og reknar summane.
- Finn du ingen passande post for noko kunden har spurt om, lat det stå ute av
  tilbodet og nemn det i føresetnadene i staden.
- Mengder skal grunngivast av det kunden faktisk har skrive. Ikkje gjett vilt —
  er mengda uklar, bruk eit forsiktig anslag og skriv det i føresetnadene.

E-postteksten skal vere kort. Den følgjer med som melding når PDF-en blir lagt
ved, så sjølve tilbodet skal ikkje gjentakast i teksten.

# SOP for e-postteksten

${sop}`;
}

function priceListBlock(items: PriceListItem[]): string {
  const rows = items
    .map((item) => {
      const parts = [
        `- id: ${item.id}`,
        `  namn: ${item.name}`,
        `  type: ${item.kind}`,
        `  eining: ${item.unit}`,
        `  einingspris: ${item.unit_price} kr`,
      ];
      if (item.code) parts.push(`  kode: ${item.code}`);
      if (item.description) parts.push(`  skildring: ${item.description}`);
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
  return `# Avsendar\n\n${lines.join("\n")}`;
}

function leadBlock(lead: GenerateInput["lead"]): string {
  return `# Førespurnaden

Frå: ${lead.from_name ?? "(ukjent)"} <${lead.from_email ?? "ukjent"}>
Emne: ${lead.subject ?? "(utan emne)"}

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
