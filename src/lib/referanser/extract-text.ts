import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

/**
 * Tekst ut av opplastede referansefiler.
 *
 * Uten dette ser agenten bare filnavnet og typen — «Tilbud Bjørkeveien.pdf,
 * punktpris» — og må gjette hva tilbudet faktisk inneholdt. Med teksten kan
 * referansefilen tagges og søkes på lik linje med bekreftede tilbud.
 *
 * Uthentingen er beste-innsats: en skannet PDF uten tekstlag gir tom streng,
 * ikke feil. Da lagres filen som før, bare uten søkbart innhold — det er
 * dagens oppførsel, så ingenting blir verre.
 */

const MAX_CHARS = 50_000;

export async function extractFileText(
  bytes: Buffer,
  fileName: string,
): Promise<string | null> {
  try {
    if (/\.pdf$/i.test(fileName)) return await fromPdf(bytes);
    if (/\.docx$/i.test(fileName)) return await fromDocx(bytes);
    // Gamle .doc-filer (binærformatet fra før 2007) kan mammoth ikke lese.
    // De lagres uten tekst, som i dag.
    return null;
  } catch {
    return null;
  }
}

async function fromPdf(bytes: Buffer): Promise<string | null> {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    return clean(result.text);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function fromDocx(bytes: Buffer): Promise<string | null> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return clean(result.value);
}

function clean(text: string | undefined): string | null {
  if (!text) return null;
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized ? normalized.slice(0, MAX_CHARS) : null;
}
