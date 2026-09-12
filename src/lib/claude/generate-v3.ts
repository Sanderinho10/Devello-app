import { structured } from "./client";
import {
  buildPrompt,
  callModel,
  resolve,
  validate,
  type GenerateInput,
  type GeneratedDraft,
} from "./generate";
import { loadBransjepakke, loadMotorV3, type Bransjepakke } from "./motor";
import { bandAvvik, omfangBlokk, omfangSjekk, type Omfang } from "./omfang";
import { referencesBlock } from "@/lib/referanser";
import { forbeholdsBlokk } from "@/lib/referanser/forbehold";

export type { Arbeidspost, Omfang } from "./omfang";

/**
 * Motor v3: omfang først, så tilbud.
 *
 * Steg 1 (omfang) leser leadet mot jobbtypesjekklistene for faget og lister
 * alt arbeid som følger av det — med sitat fra leadet, mengde, kilde og
 * ja/nei/ikke relevant. Ingen priser. Steg 2 (tilbud) er v2-genereringen med
 * omfanget i konteksten og en regel om at ingen inkludert arbeidspost får
 * forsvinne.
 *
 * Koden vokter mellom stegene og etter: minst så mange poster som jobbtypen
 * krever, og en sum innenfor rimelighetsbåndet. Utenfor → agenten får utkastet
 * tilbake én gang med beskjed om hva den skal se etter. Det er
 * evaluator-optimizer med eksterne kriterier, ikke «sjekk arbeidet ditt».
 *
 * Alt som er penger går samme vei som i v2: modellen peker på price_item_id,
 * koden slår opp prisen og regner summene.
 */

function omfangSchema(pakke: Bransjepakke) {
  return {
    type: "object",
    properties: {
      jobbtype: {
        type: "string",
        enum: pakke.jobbtyper.map((j) => j.id),
        description: "Jobbtype-id fra sjekklistene. «sammensatt» ved flere ulike jobber, «annet» når ingen passer.",
      },
      kundetype: {
        type: "string",
        enum: ["forbruker", "bedrift", "ukjent"],
        description: "forbruker = privatperson og bolig; bedrift = firmanavn, org.nr. eller næringslokale; ukjent ellers.",
      },
      status: {
        type: "string",
        enum: ["utkast", "trenger_avklaring"],
        description: "trenger_avklaring KUN når selve jobbtypen er ukjent («trenger elektriker til huset»).",
      },
      arbeidsposter: {
        type: "array",
        description:
          "Alt arbeid som følger av leadet — hvert punkt i sjekklisten for jobbtypen vurdert, pluss det leadet nevner utenom. Ingen priser.",
        items: {
          type: "object",
          properties: {
            kva: { type: "string", description: "Hva arbeidet er. Internt felt, bokmål er greit." },
            sitat: {
              type: "string",
              description: "Setningen i leadet posten kommer fra, ordrett. Tom streng når posten er fra sjekklisten.",
            },
            mengde: { type: ["number", "null"], description: "Antall/meter/m². null når posten ikke har mengde." },
            enhet: { type: "string", description: "stk, m, m², time." },
            kilde: {
              type: "string",
              enum: ["lead", "antakelse", "sjekkliste"],
              description: "lead = mengden står i leadet; antakelse = du anslo den (og skrev det i antakelser); sjekkliste = posten er fra sjekklisten og kunden nevnte den ikke.",
            },
            inkludert: {
              type: "string",
              enum: ["ja", "nei", "ikke_relevant"],
              description: "ja = prises i dette tilbudet; nei = kan høre med, blir forbehold/spørsmål; ikke_relevant = hører ikke til jobben.",
            },
            begrunnelse: { type: ["string", "null"], description: "Kort, særlig ved nei. null når det er opplagt." },
          },
          required: ["kva", "sitat", "mengde", "enhet", "kilde", "inkludert", "begrunnelse"],
          additionalProperties: false,
        },
      },
      antakelser: {
        type: "array",
        items: { type: "string" },
        description: "Maks 3. Mengder og omfang du anslo fordi leadet ikke sa det, i kundens målform, konkret nok til å motsi.",
      },
      sporsmal_til_kunden: {
        type: "array",
        items: { type: "string" },
        description: "Maks 3, i kundens målform. Bare det som flytter prisen vesentlig og som leadet ikke svarer på. Tom liste er et godt svar.",
      },
    },
    required: ["jobbtype", "kundetype", "status", "arbeidsposter", "antakelser", "sporsmal_til_kunden"],
    additionalProperties: false,
  };
}

export async function generateDraftV3(input: GenerateInput): Promise<GeneratedDraft> {
  const fag = (input.fag ?? "elektro").trim().toLowerCase() || "elektro";
  const pakke = await loadBransjepakke(fag);
  const { prefiks } = buildPrompt(input);
  const leadBlokk = leadBlock(input);

  // ---- Steg 1: omfang ------------------------------------------------------
  const systemOmfang = await loadMotorV3("omfang", fag);
  const rawOmfang = await structured<Omfang>({
    system: systemOmfang,
    schema: omfangSchema(pakke),
    // Samme prefiks som steg 2 og som v2: innstillinger + prisliste. Steg 2
    // kommer sekunder etter og leser det rett ut av cachen.
    cachePrefix: prefiks,
    cacheSystem: true,
    prompt: [referencesBlock(input.similar ?? []), leadBlokk, laastBlokk(input)].filter(Boolean).join("\n\n"),
    usage: { companyId: input.companyId, kind: "omfang", leadId: input.leadId ?? null },
  });
  const omfang = normaliserOmfang(rawOmfang, pakke);
  const jobbtype = pakke.jobbtyper.find((j) => j.id === omfang.jobbtype) ?? null;

  // ---- Steg 2: tilbud ------------------------------------------------------
  const systemTilbud = await loadMotorV3("tilbud", fag);
  const resten = [
    referencesBlock(input.similar ?? []),
    forbeholdsBlokk(input.forbehold ?? []),
    omfangBlokk(omfang, jobbtype),
    leadBlokk,
    laastBlokk(input),
  ]
    .filter(Boolean)
    .join("\n\n");

  const usage = { companyId: input.companyId, kind: "generering" as const, leadId: input.leadId ?? null };

  let raw = await callModel(systemTilbud, prefiks, resten, usage);
  let problems = [...validate(raw, input), ...omfangSjekk(raw, omfang, jobbtype)];
  if (problems.length > 0) {
    raw = await callModel(systemTilbud, prefiks, medFeil(resten, problems), usage);
    problems = [...validate(raw, input), ...omfangSjekk(raw, omfang, jobbtype)];
    if (problems.length > 0) {
      throw new Error(`Utkastet besto ikke valideringen: ${problems.join("; ")}`);
    }
  }

  let utkast = resolve(raw, input);

  // ---- Rimelighetsvakt -----------------------------------------------------
  //
  // Prisene er slått opp, så nå vet vi hva utkastet faktisk summerer til.
  // Utenfor båndet for jobbtypen får agenten ÉN runde til, med tallet og
  // båndet foran seg og beskjed om å gå gjennom arbeidspostene. Fortsatt
  // utenfor: utkastet går videre med en merknad — mennesket avgjør, og et
  // uvanlig tilbud kan være riktig.
  const avvik = bandAvvik(utkast.document, jobbtype);
  if (avvik) {
    const kritikk =
      `Summen eks. mva er ${avvik.sum} kr. For jobbtypen «${jobbtype!.navn}» ligger tilbud normalt mellom ` +
      `${avvik.lo} og ${avvik.hi} kr. Gå gjennom arbeidspostene med inkludert «ja» én for én: er hver av dem en post, ` +
      `en del av en pakkepost (sagt i beskrivelsen), eller i ikke_funnet? Stemmer mengdene med omfanget? ` +
      `Rett det som mangler og lever hele tilbudsdataen på nytt. Er summen riktig likevel, lever den uendret og forklar i merknader.`;
    const raw2 = await callModel(systemTilbud, prefiks, medFeil(resten, [kritikk]), usage);
    const problems2 = [...validate(raw2, input), ...omfangSjekk(raw2, omfang, jobbtype)];
    if (problems2.length === 0) {
      raw = raw2;
      utkast = resolve(raw, input);
    }
    const avvik2 = bandAvvik(utkast.document, jobbtype);
    if (avvik2) {
      utkast.merknader.push(
        `Summen (${avvik2.sum} kr eks. mva) er utenfor det som er vanlig for «${jobbtype!.navn}» (${avvik2.lo}–${avvik2.hi} kr). Agenten har gått gjennom omfanget én gang til uten å endre den. Sjekk om noe mangler eller er tatt med for mye.`,
      );
    }
  }

  return { ...utkast, motor_versjon: "v3", omfang };
}

// ---------------------------------------------------------------------------
// Prompt-blokker
// ---------------------------------------------------------------------------

function leadBlock(input: GenerateInput): string {
  return `# Leadet\n\nFra: ${input.lead.from_name ?? "(ukjent)"} <${input.lead.from_email ?? "ukjent"}>\nEmne: ${
    input.lead.subject ?? "(uten emne)"
  }\n\n${input.lead.body_text ?? ""}`;
}

function laastBlokk(input: GenerateInput): string {
  if (!input.lockedType) return "";
  return `# Låst tilbudstype\n\ntilbudstype_laast: ${input.lockedType}\n\nBrukeren har valgt typen selv. Generer utkastet for denne typen — ikke velg en annen. Begrunnelsen kan si hva du ellers ville anbefalt.`;
}

function medFeil(resten: string, problems: string[]): string {
  return `${resten}\n\n---\n\nFORRIGE FORSØK FEILET VALIDERINGEN. Rett dette og lever hele tilbudsdataen på nytt:\n${problems
    .map((p) => `- ${p}`)
    .join("\n")}`;
}

// ---------------------------------------------------------------------------
// Vaktene
// ---------------------------------------------------------------------------

function normaliserOmfang(raw: Omfang, pakke: Bransjepakke): Omfang {
  const kjent = new Set(pakke.jobbtyper.map((j) => j.id));
  return {
    jobbtype: kjent.has(raw.jobbtype) ? raw.jobbtype : "annet",
    kundetype: raw.kundetype ?? "ukjent",
    status: raw.status === "trenger_avklaring" ? "trenger_avklaring" : "utkast",
    arbeidsposter: (raw.arbeidsposter ?? []).filter((p) => p && typeof p.kva === "string" && p.kva.trim()),
    antakelser: (raw.antakelser ?? []).filter(Boolean).slice(0, 3),
    sporsmal_til_kunden: (raw.sporsmal_til_kunden ?? []).filter(Boolean).slice(0, 3),
  };
}
