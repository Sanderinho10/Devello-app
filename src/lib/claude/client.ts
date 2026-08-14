import Anthropic from "@anthropic-ai/sdk";

/** Claude Opus 5. Modellvalet er sentralisert her. */
export const MODEL = "claude-opus-5";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Manglar ANTHROPIC_API_KEY. Sjå .env.example.");
    }
    cached = new Anthropic();
  }
  return cached;
}

/**
 * Køyrer eit kall med strukturert output og returnerer det parsa objektet.
 * Vi brukar output_config.format slik at svaret alltid validerer mot skjemaet —
 * ingen regex-uthenting, ingen retry-loop rundt JSON.parse.
 */
export async function structured<T>(options: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<T> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: options.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: options.effort ?? "high",
      format: { type: "json_schema", schema: options.schema },
    },
    system: options.system,
    messages: [{ role: "user", content: options.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      "Modellen avslo førespurnaden. Sjekk innhaldet i leadet og prøv igjen.",
    );
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Fekk ikkje tekst tilbake frå modellen.");
  }
  return JSON.parse(text.text) as T;
}
