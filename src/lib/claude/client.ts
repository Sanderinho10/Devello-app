import Anthropic from "@anthropic-ai/sdk";

/** Claude Opus 5. Modellvalget er sentralisert her. */
export const MODEL = "claude-opus-5";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Mangler ANTHROPIC_API_KEY. Se .env.example.");
    }
    cached = new Anthropic();
  }
  return cached;
}

/**
 * Kjører et kall med strukturert output og returnerer det parsede objektet.
 * Vi bruker output_config.format slik at svaret alltid validerer mot skjemaet —
 * ingen regex-uthenting, ingen retry-loop rundt JSON.parse.
 */
export async function structured<T>(options: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<T> {
  let response;
  try {
    response = await anthropic().messages.create({
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
  } catch (err) {
    throw translateApiError(err);
  }

  if (response.stop_reason === "refusal") {
    throw new Error(
      "Modellen avslo forespørselen. Sjekk innholdet i leadet og prøv igjen.",
    );
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Fikk ikke tekst tilbake fra modellen.");
  }
  return JSON.parse(text.text) as T;
}

/**
 * Rå SDK-feil er JSON-blobber som ikke sier brukeren noe. De tre tilstandene
 * folk faktisk havner i — feil nøkkel, tom konto, for mange kall — fortjener et
 * svar som sier hva man skal gjøre.
 */
function translateApiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error(
      "Anthropic avviste nøkkelen. Sjekk at ANTHROPIC_API_KEY i .env.local er " +
        "komplett og uten hermetegn, og at serveren er startet på nytt etterpå.",
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("For mange kall mot Anthropic akkurat nå. Prøv igjen om litt.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error("Fikk ikke kontakt med Anthropic. Sjekk nettverkstilkoblingen.");
  }
  // APIError er basen for alle HTTP-feil, så den må stå etter de spesifikke.
  if (err instanceof Anthropic.APIError) {
    // Tom konto kommer som 400 med en melding om credit balance.
    if (err.message.toLowerCase().includes("credit balance")) {
      return new Error(
        "Anthropic-kontoen har ikke kreditt. Legg til betaling under Billing i konsollen.",
      );
    }
    return new Error(`Anthropic svarte ${err.status}: ${err.message}`);
  }
  return err instanceof Error ? err : new Error(String(err));
}
