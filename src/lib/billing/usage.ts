// Fra admin.ts, ikke server.ts: server.ts drar inn next/headers, og denne
// modulen ligger i importkjeden til scriptene (evaluer, gullsett, test:agent).
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Tokenforbruk per modellkall.
 *
 * Anthropic svarer med hvor mange tokens som gikk inn, hvor mange som ble
 * mellomlagret og hvor mange som kom ut. Det er den eneste kilden som faktisk
 * vet hva et tilbud kostet — alt annet er anslag basert på tegn i prompten.
 *
 * Loggingen skal aldri kunne stoppe en generering. Feiler skrivingen, går
 * tilbudet ut som normalt og feilen havner i loggen.
 */

/** Hvilket av kallene i tilbudsløpet dette var. */
export type ModellKall =
  | "generering"
  /** v3, steg 1: omfanget — arbeidsposter og spørsmål, ingen priser. */
  | "omfang"
  | "tagging_lead"
  | "tagging_tilbud"
  | "tagging_referansefil"
  /** Skannet PDF lest av modellen fordi den ikke hadde tekstlag. */
  | "lesing_skanna_pdf"
  /** Ordremodulen: kort arbeidsbeskrivelse ved oppretting fra tilbud. Liten modell. */
  | "ordre_beskrivelse"
  /** Ordremodulen: fakturaforslaget — struktur og tekst, aldri beløp. */
  | "fakturaforslag";

export interface UsageContext {
  companyId: string;
  kind: ModellKall;
  /** Leadet kallet hørte til, når det finnes. */
  leadId?: string | null;
}

/** Feltene vi bruker fra Anthropics usage-objekt. */
export interface ModellUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export async function loggModellbruk(
  ctx: UsageContext,
  model: string,
  usage: ModellUsage | null | undefined,
): Promise<void> {
  if (!usage) return;
  try {
    await supabaseAdmin().from("model_usage").insert({
      company_id: ctx.companyId,
      kind: ctx.kind,
      model,
      input_tokens: usage.input_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      lead_id: ctx.leadId ?? null,
    });
  } catch (err) {
    console.warn(
      "kunne ikke logge modellbruk:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Dollar per million tokens, per modell.
 *
 * ⚠️ Håndholdte tall. Endrer Anthropic prisene, endres de her — det finnes
 * ingen pris-API å slå opp i. Sjekk mot konsollen før du stoler på en
 * kostnadsrapport som er bygget på disse.
 *
 * Skrivepremien avhenger av levetiden på cachen: 1,25× ved 5 minutter,
 * 2× ved 1 time. Vi bruker 5 minutter på prisblokka og 1 time på motoren,
 * så en samlet sats her er et anslag. Tokentallene i tabellen er eksakte.
 *
 * Haiku-satsen finnes fordi ordremodulen kjører små kall på den lille
 * modellen. Priset alle rader som opus, ville en beskrivelse på 300 tokens
 * sett fem ganger dyrere ut enn den var.
 */
export interface Satser {
  input: number;
  cache_write: number;
  cache_read: number;
  output: number;
}

export const SATSER_USD_PER_MTOK: Record<string, Satser> = {
  "claude-opus-5": { input: 5, cache_write: 6.25, cache_read: 0.5, output: 25 },
  "claude-haiku-4-5": { input: 1, cache_write: 1.25, cache_read: 0.1, output: 5 },
};

/** Modellen radene uten kjent sats prises som. Opus er den dyreste — bedre å overdrive. */
const STANDARD_SATS = SATSER_USD_PER_MTOK["claude-opus-5"];

export function satserFor(model: string | null | undefined): Satser {
  return (model && SATSER_USD_PER_MTOK[model]) || STANDARD_SATS;
}

export function kostnadUsd(rad: {
  model?: string | null;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
}): number {
  const s = satserFor(rad.model);
  return (
    (rad.input_tokens * s.input +
      rad.cache_write_tokens * s.cache_write +
      rad.cache_read_tokens * s.cache_read +
      rad.output_tokens * s.output) /
    1_000_000
  );
}
