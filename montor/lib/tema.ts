import type { FontVariant } from "react-native";

/**
 * Designtokener — samme visuelle familie som nettappen
 * (Devello-app/src/app/globals.css). Endres verdiene der, endres de her.
 */
export const farge = {
  bakgrunn: "#f5f5f7",
  flate: "#ffffff",
  flateSenket: "#fafafc",
  kant: "#e8e8ed",
  kantSterk: "#d2d2d7",
  tekst: "#1d1d1f",
  tekstSekundaer: "#6e6e73",
  tekstTertiaer: "#86868b",
  aksent: "#0071e3",
  aksentMyk: "#e8f2fd",
  positiv: "#1d8a4e",
  positivMyk: "#e6f4ec",
  advarsel: "#b25000",
  advarselMyk: "#fdf0e5",
  negativ: "#b3261e",
  negativMyk: "#fdecea",
  hvit: "#ffffff",
} as const;

export const radius = { sm: 8, md: 12, lg: 18 } as const;

export const avstand = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Minste trykkflate 48 pt; primærknappen er 56 pt. Hansker på. */
export const trykk = { minste: 48, primaer: 56 } as const;

export const skrift = {
  liten: 13,
  normal: 16,
  stor: 18,
  tittel: 22,
  tall: 44,
} as const;

/** Tall skal stå i kolonner — tabular-nums der plattformen støtter det. */
export const tabellTall: { fontVariant: FontVariant[] } = { fontVariant: ["tabular-nums"] };
