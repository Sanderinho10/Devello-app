import type { QuoteDocument } from "@/lib/types";
import type { DraftSnapshot } from "@/lib/drafts/versions";

/**
 * Hva brukeren endret, i klartekst.
 *
 * Skrevet i kode, ikke av en modell. Dette er ren telling — hvilke felt som
 * ble rørt, hvor mange poster som kom til eller falt bort — og da skal ingen
 * modell stå mellom fakta og teksten. Den korte setningen går inn i
 * referanselisten og vises igjen neste gang et lignende lead kommer inn.
 *
 * Beløp er med vilje utelatt. Endrer noen en pris i et utkast, er det en
 * avgjørelse for den ene jobben — og en setning om at «summen gikk opp 50 %»
 * i konteksten er nettopp det agenten ikke skal lære av. Prisene kommer fra
 * prisfilen, alltid.
 */
export function summarizeEdits(
  before: DraftSnapshot,
  after: DraftSnapshot,
): string | null {
  const deler: string[] = [];

  if (before.quote_type !== after.quote_type) {
    deler.push(`byttet tilbudstype fra ${before.quote_type} til ${after.quote_type}`);
  }
  if (before.email_subject !== after.email_subject) {
    deler.push("endret emnefeltet");
  }
  if (before.email_body !== after.email_body) {
    deler.push("skrev om e-postteksten");
  }

  const poster = tellPoster(before.document, after.document);
  if (poster) deler.push(poster);

  const forutsetninger = tellForutsetninger(before.document, after.document);
  if (forutsetninger) deler.push(forutsetninger);

  if (deler.length === 0) return null;
  return `Brukeren ${deler.join(", ")}.`;
}

function alleLinjer(doc: QuoteDocument | null) {
  return doc ? doc.sections.flatMap((s) => s.lines) : [];
}

function tellPoster(før: QuoteDocument | null, etter: QuoteDocument | null): string | null {
  const a = alleLinjer(før);
  const b = alleLinjer(etter);
  if (a.length === b.length) {
    // Like mange, men kan være byttet ut.
    const endret = b.filter(
      (linje, i) =>
        a[i] &&
        (a[i].description !== linje.description || a[i].quantity !== linje.quantity),
    ).length;
    return endret > 0 ? `justerte ${endret} ${endret === 1 ? "post" : "poster"}` : null;
  }
  const diff = b.length - a.length;
  return diff > 0
    ? `la til ${diff} ${diff === 1 ? "post" : "poster"}`
    : `fjernet ${-diff} ${-diff === 1 ? "post" : "poster"}`;
}

function tellForutsetninger(
  før: QuoteDocument | null,
  etter: QuoteDocument | null,
): string | null {
  const a = før?.assumptions ?? [];
  const b = etter?.assumptions ?? [];
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  const diff = b.length - a.length;
  if (diff > 0) return `la til ${diff} ${diff === 1 ? "forutsetning" : "forutsetninger"}`;
  if (diff < 0) return `fjernet ${-diff} forutsetninger`;
  return "endret forutsetningene";
}

