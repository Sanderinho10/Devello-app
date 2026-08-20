import { supabaseAdmin } from "@/lib/supabase/server";

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
  | "tagging_lead"
  | "tagging_tilbud"
  | "tagging_referansefil";

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
 * Dollar per million tokens for claude-opus-5.
 *
 * ⚠️ Håndholdte tall. Endrer Anthropic prisene, endres de her — det finnes
 * ingen pris-API å slå opp i. Sjekk mot konsollen før du stoler på en
 * kostnadsrapport som er bygget på disse.
 *
 * Skrivepremien avhenger av levetiden på cachen: 1,25× ved 5 minutter,
 * 2× ved 1 time. Vi bruker 5 minutter på prisblokka og 1 time på motoren,
 * så en samlet sats her er et anslag. Tokentallene i tabellen er eksakte.
 */
export const SATSER_USD_PER_MTOK = {
  input: 5,
  cache_write: 6.25,
  cache_read: 0.5,
  output: 25,
} as const;

export function kostnadUsd(rad: {
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
}): number {
  const s = SATSER_USD_PER_MTOK;
  return (
    (rad.input_tokens * s.input +
      rad.cache_write_tokens * s.cache_write +
      rad.cache_read_tokens * s.cache_read +
      rad.output_tokens * s.output) /
    1_000_000
  );
}
