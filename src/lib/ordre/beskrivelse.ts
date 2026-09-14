import { MODEL_SMALL, structured } from "@/lib/claude/client";
import type { Draft, Lead, QuoteDocument } from "@/lib/types";

/**
 * Kort arbeidsbeskrivelse for en ordre, skrevet av den lille modellen.
 *
 * Når en ordre opprettes fra et tilbud, har vi henvendelsen og tilbudet —
 * men ingen av dem sier med to-fire setninger hva jobben går ut på. Det er
 * det montøren trenger øverst på ordren. Modellen skriver et første utkast;
 * det er fritt redigerbart etterpå, og description_source viser hvem som
 * skrev det.
 *
 * Kallet er billig og aldri kritisk: feiler det, får ordren ingen
 * beskrivelse, og den som oppretter skriver den selv. Derfor returnerer
 * denne null i stedet for å kaste — en ordre skal aldri stoppe på en tekst.
 */

const MAKS_HENVENDELSE = 2_000;
const MAKS_EPOSTTEKST = 1_500;
const MAKS_LINJER = 15;

const SKJEMA = {
  type: "object",
  properties: {
    beskrivelse: {
      type: "string",
      description: "2–4 setninger om hva som skal gjøres og hvor i bygget.",
    },
  },
  required: ["beskrivelse"],
  additionalProperties: false,
} as const;

export async function lagOrdreBeskrivelse(input: {
  lead: Pick<Lead, "id" | "subject" | "body_text" | "body_preview">;
  draft: Pick<Draft, "quote_type" | "document" | "email_body">;
  maalform: "nb" | "nn";
  companyId: string;
}): Promise<string | null> {
  try {
    const { lead, draft } = input;
    const document = draft.document as QuoteDocument | null;

    const linjer = (document?.sections ?? [])
      .flatMap((s) => s.lines.map((l) => l.description))
      .filter(Boolean)
      .slice(0, MAKS_LINJER);

    const deler: string[] = [];
    if (lead.subject) deler.push(`Emne: ${lead.subject}`);
    const henvendelse = (lead.body_text || lead.body_preview || "").slice(
      0,
      MAKS_HENVENDELSE,
    );
    if (henvendelse) deler.push(`Henvendelsen fra kunden:\n${henvendelse}`);
    deler.push(`Tilbudstype: ${draft.quote_type}`);
    if (document?.title) deler.push(`Tilbudets tittel: ${document.title}`);
    if (linjer.length) {
      deler.push(`Poster i tilbudet:\n${linjer.map((l) => `- ${l}`).join("\n")}`);
    }
    const epost = (draft.email_body ?? "").slice(0, MAKS_EPOSTTEKST);
    if (epost) deler.push(`E-postteksten i tilbudet:\n${epost}`);

    const maalform = input.maalform === "nn" ? "nynorsk" : "bokmål";

    // Kort og ikke mellomlagret: prompten er under minstemålet for cache,
    // og kallet går én gang per ordre.
    const system =
      "Du skriver en kort arbeidsbeskrivelse av et oppdrag for en håndverksbedrift. " +
      "Beskrivelsen skal stå øverst på ordren og leses av montøren som skal gjøre jobben.\n\n" +
      "Regler:\n" +
      `- 2–4 setninger, på ${maalform}.\n` +
      "- Si hva som skal gjøres og hvor i bygget.\n" +
      "- Ingen priser, ingen hilsen, ingen innledning.\n" +
      "- Ikke gjenta kundens navn eller adresse — de står i egne felt på ordren.\n" +
      "- Ingen plassholdere eller klammer. Mangler en opplysning, utelat den.";

    const svar = await structured<{ beskrivelse: string }>({
      model: MODEL_SMALL,
      system,
      prompt: deler.join("\n\n"),
      schema: SKJEMA,
      maxTokens: 400,
      usage: {
        companyId: input.companyId,
        kind: "ordre_beskrivelse",
        leadId: lead.id,
      },
    });

    const tekst = svar.beskrivelse?.trim();
    return tekst ? tekst : null;
  } catch (err) {
    console.warn(
      "kunne ikke skrive ordrebeskrivelse:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
