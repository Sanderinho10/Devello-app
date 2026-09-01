import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { lesSkannaPdf } from "./les-skanna-pdf";
import type { UsageContext } from "@/lib/billing/usage";

/**
 * Tekst ut av opplastede referansefiler.
 *
 * Uten dette ser agenten bare filnavnet og typen — «Tilbud Bjørkeveien.pdf,
 * punktpris» — og må gjette hva tilbudet faktisk inneholdt. Med teksten kan
 * referansefilen tagges og søkes på lik linje med bekreftede tilbud.
 *
 * To veier inn. Tekstlaget først: gratis, øyeblikkelig, og det dekker alt som
 * er eksportert fra et tilbudsprogram. Har PDF-en ikke noe tekstlag — den er
 * skrevet ut og skannet inn — leser modellen den i stedet. Se les-skanna-pdf.
 *
 * Fortsatt beste-innsats: går begge veier i vasken, får kalleren null og filen
 * lagres uten søkbart innhold, som før. En referansefil som ikke lot seg lese
 * skal ikke velte en opplasting.
 */

const MAX_CHARS = 50_000;

export async function extractFileText(
  bytes: Buffer,
  fileName: string,
  /** Selskapet lesingen skal bokføres på, når modellen må ta over. */
  usage?: UsageContext,
): Promise<string | null> {
  let fraTekstlag: string | null = null;
  try {
    if (/\.pdf$/i.test(fileName)) fraTekstlag = await fromPdf(bytes);
    else if (/\.docx$/i.test(fileName)) return await fromDocx(bytes);
    // Gamle .doc-filer (binærformatet fra før 2007) kan mammoth ikke lese.
    // De lagres uten tekst, som i dag.
    else return null;
  } catch {
    fraTekstlag = null;
  }

  if (fraTekstlag) return fraTekstlag;

  // Ingen tekst i PDF-en. Enten er den skannet, eller så er tekstlaget ødelagt
  // — begge deler ser like ut herfra, og begge løses av å la modellen lese den.
  return clean(await lesSkannaPdf(bytes, usage));
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

function clean(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized ? normalized.slice(0, MAX_CHARS) : null;
}
