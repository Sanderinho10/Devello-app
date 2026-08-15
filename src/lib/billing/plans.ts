/**
 * Abonnementspakker.
 *
 * ⚠️ PRISENE HER ER PLASSHOLDERE. De er satt for å få valget på plass, ikke
 * fordi de er avtalt. Sett riktige priser før første kunde skal betale.
 *
 * Betaling er ikke koblet på. Å velge pakke skriver bare valget på selskapet —
 * ingen faktura blir sendt, og ingenting blir trukket. Prøveperioden utløper
 * uten at noe skjer.
 */

export interface Plan {
  id: string;
  name: string;
  /** Kroner per måned, eks. mva. */
  price: number;
  tagline: string;
  features: string[];
  /** Fremhevet i UI-et som det anbefalte valget. */
  recommended?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: "tilbud",
    name: "Tilbud",
    price: 990,
    tagline: "Tilbudsagenten, én postkasse.",
    features: [
      "Leser innboksen og foreslår tilbudstype",
      "Punktpris, fastpris og tid og materiell",
      "PDF på deres egen mal",
      "Kladd i Outlook — dere sender selv",
      "Ubegrenset antall tilbud",
    ],
    recommended: true,
  },
  {
    id: "komplett",
    name: "Komplett",
    price: 1990,
    tagline: "Alle agenter, etter hvert som de kommer.",
    features: [
      "Alt i Tilbud",
      "SoMe-agenten når den lanseres",
      "Annonseagenten når den lanseres",
      "Prioritert support",
    ],
  },
];

export function findPlan(id: string | null): Plan | null {
  if (!id) return null;
  return PLANS.find((plan) => plan.id === id) ?? null;
}

export function formatPrice(nok: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(nok);
}

/** Dager igjen av prøveperioden. Negativt tall betyr at den er ute. */
export function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
