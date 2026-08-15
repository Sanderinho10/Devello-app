import {
  hasDocument,
  kindsForQuoteType,
  type PriceListItem,
  type QuoteConfidence,
  type QuoteDocument,
  type QuoteType,
} from "@/lib/types";

export interface ConfidenceAssessment {
  level: QuoteConfidence;
  /** Én linje per signal, vist i hjelpeboblen. */
  reasons: string[];
}

/**
 * Hvor mye vekt utkastet tåler.
 *
 * Dette er ikke modellens egen vurdering av seg selv — den er notorisk
 * upålitelig, og en modell som er sikker tar like ofte feil som en som nøler.
 * Vurderingen bygger i stedet på to ting vi kan slå opp:
 *
 *   1. Har kunden referansetilbud av denne typen? Da har agenten en fasit å
 *      matche mot i stedet for å gjette ut fra omfanget alene.
 *   2. Fant alle postene et treff i prisfilen? En post som ikke gjorde det er
 *      droppet, og da mangler tilbudet noe kunden faktisk spurte om.
 *
 * Signalene er verifiserbare, så grønt betyr noe. Fargen er en oppfordring til
 * å lese nøye, ikke en garanti — mennesket trykker send uansett.
 */
export function assessConfidence(input: {
  quoteType: QuoteType;
  references: { type: QuoteType }[];
  priceItems: PriceListItem[];
  document: QuoteDocument | null;
  /** Poster modellen ba om som ikke fantes i prisfilen. */
  unresolvedLines: number;
}): ConfidenceAssessment {
  const { quoteType, references, priceItems, document, unresolvedLines } = input;

  const matchingReferences = references.filter((ref) => ref.type === quoteType).length;

  const kinds = kindsForQuoteType(quoteType);
  const available = priceItems.filter(
    (item) => item.active && kinds.includes(item.kind),
  ).length;

  const reasons: string[] = [
    matchingReferences > 0
      ? `${matchingReferences} referansetilbud av samme type å matche mot.`
      : "Ingen referansetilbud av denne typen — typen er valgt ut fra omfanget alene.",
  ];

  let coverage: "full" | "delvis" | "ingen";

  if (hasDocument(quoteType)) {
    const lines = document
      ? document.sections.reduce((sum, section) => sum + section.lines.length, 0)
      : 0;

    if (lines === 0) {
      coverage = "ingen";
      reasons.push("Ingen poster kunne hentes fra prisfilen.");
    } else if (unresolvedLines > 0) {
      coverage = "delvis";
      reasons.push(
        `${unresolvedLines} ${unresolvedLines === 1 ? "post" : "poster"} fant ingen ` +
          "match i prisfilen og er utelatt. Sjekk om noe mangler.",
      );
    } else {
      coverage = "full";
      reasons.push(`Alle ${lines} postene kommer fra prisfilen.`);
    }
  } else {
    // Tid og materiell har ingen poster — det er timeprisene teksten hviler på.
    coverage = available > 0 ? "full" : "ingen";
    reasons.push(
      available > 0
        ? `${available} timepriser i prisfilen å vise til.`
        : "Ingen timepriser lagt inn — teksten mangler satser.",
    );
  }

  let level: QuoteConfidence;
  if (available === 0 || coverage === "ingen") {
    level = "laag";
  } else if (coverage === "delvis") {
    level = matchingReferences > 0 ? "middels" : "laag";
  } else {
    level = matchingReferences > 0 ? "hoeg" : "middels";
  }

  return { level, reasons };
}

/**
 * Poster som peker på en prisrad som ikke finnes lenger.
 *
 * Brukt når vi henter fram et lagret utkast: raden kan ha blitt slettet eller
 * listen deaktivert siden utkastet ble laget, og da er dekningen dårligere enn
 * den var.
 */
export function countUnresolvedLines(
  document: QuoteDocument | null,
  priceItems: PriceListItem[],
): number {
  if (!document) return 0;
  const known = new Set(priceItems.map((item) => item.id));
  return document.sections.reduce(
    (sum, section) =>
      sum +
      section.lines.filter(
        (line) => !line.price_item_id || !known.has(line.price_item_id),
      ).length,
    0,
  );
}
