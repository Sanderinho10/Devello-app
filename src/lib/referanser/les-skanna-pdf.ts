import { anthropic, MODEL } from "@/lib/claude/client";
import { loggModellbruk, type UsageContext } from "@/lib/billing/usage";

/**
 * Leser en skannet PDF.
 *
 * pdf-parse henter tekstlaget. Et tilbud som er skrevet ut og skannet inn har
 * ikke noe tekstlag — det er et bilde av tekst — og da kom det tom streng
 * tilbake. Fjorten slike lå hos Star Elektro, og resultatet var at agenten
 * ikke hadde én eneste referanse å bygge på selv om skjermen sa fjorten.
 *
 * Modellen kan lese dem. PDF-en sendes som et dokument, og svaret er teksten.
 * Det koster noen kroner per fil, én gang — og alternativet er at referansene
 * ikke finnes.
 *
 * Aldri kritisk: feiler den, får kalleren null og filen lagres uten tekst, som
 * før. En referansefil som ikke lot seg lese skal ikke velte en opplasting.
 */

/** Anthropic tar imot PDF-er opp til 32 MB. Vi stopper godt under. */
const MAKS_BYTES = 25 * 1024 * 1024;

const SYSTEM = `Du transkriberer et skannet tilbud fra en håndverksbedrift.

Skriv ut ALT som står i dokumentet, ordrett og i samme rekkefølge: overskrifter,
poster med mengder og priser, summer, forbehold, betingelser og tekst i bunn- og
topptekst. Behold tallene nøyaktig slik de står.

Ingen innledning, ingen oppsummering, ingen kommentarer om hva du ser. Bare
teksten. Er en side uleselig, skriv «[uleselig side]» og gå videre.`;

export async function lesSkannaPdf(
  bytes: Buffer,
  usage?: UsageContext,
): Promise<string | null> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAKS_BYTES) return null;

  try {
    const response = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 8000,
      // Transkribering er ikke en oppgave som blir bedre av å tenke lenge på
      // den. Den skal lese det som står.
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: bytes.toString("base64"),
              },
            },
            { type: "text", text: "Skriv ut teksten i dette tilbudet." },
          ],
        },
      ],
    });

    if (usage) await loggModellbruk(usage, MODEL, response.usage);

    const tekst = response.content
      .filter((b): b is { type: "text"; text: string } & typeof b => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return tekst.length > 40 ? tekst : null;
  } catch (err) {
    console.warn(
      "kunne ikke lese skannet PDF:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
