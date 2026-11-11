import type { FontVariant, TextStyle, ViewStyle } from "react-native";

/**
 * Designtokener — de samme som nettappen (Devello-app/src/app/globals.css).
 *
 * Form, skrift og farger er Apple: systemskriften, stram bokstavavstand på
 * titler, kapselknapper, myke hjørner, lyst og grått med én blå aksent, og
 * grønt, oransje og rødt bare der noe skal sies. Oppsettet er lånt fra
 * PowerOffice Go: tette lister, understrekede faner, tall i kolonner.
 * Endres verdiene i globals.css, endres de her.
 */
export const farge = {
  bakgrunn: "#f5f5f7",
  flate: "#ffffff",
  flateSenket: "#fafafc",
  kant: "#e8e8ed",
  kantSterk: "#d2d2d7",
  /** Grå fyll bak sekundærknapper, søkefelt og segmenter. */
  fyll: "rgba(0, 0, 0, 0.06)",
  fyllTrykket: "rgba(0, 0, 0, 0.1)",
  tekst: "#1d1d1f",
  tekstSekundaer: "#6e6e73",
  tekstTertiaer: "#86868b",
  aksent: "#0071e3",
  aksentTrykket: "#0064c8",
  aksentMyk: "#e8f2fd",
  positiv: "#248a3d",
  positivMyk: "#e5f6e9",
  advarsel: "#c93400",
  advarselMyk: "#fff1e5",
  negativ: "#d70015",
  negativMyk: "#ffebed",
  /** Møter i kalenderen — samme lilla som nettappen. */
  mote: "#8944ab",
  moteMyk: "#f4ebf9",
  hvit: "#ffffff",
} as const;

export const radius = { sm: 8, md: 10, lg: 12, xl: 16, kapsel: 980 } as const;

export const avstand = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;

/** Sidemarg på alle skjermer. */
export const marg = 16;

/** Minste trykkflate 48 pt; primærknappen er 54 pt. Hansker på. */
export const trykk = { minste: 48, primaer: 54 } as const;

/** Tall skal stå i kolonner. */
export const tabellTall: { fontVariant: FontVariant[] } = { fontVariant: ["tabular-nums"] };

/** Skriftstilene. Titler har Apples stramme bokstavavstand. */
export const skrift = {
  storTittel: { fontSize: 34, fontWeight: "700", letterSpacing: -0.8, color: farge.tekst } as TextStyle,
  tittel: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: farge.tekst } as TextStyle,
  overskrift: { fontSize: 17, fontWeight: "600", letterSpacing: -0.3, color: farge.tekst } as TextStyle,
  kropp: { fontSize: 17, letterSpacing: -0.2, color: farge.tekst } as TextStyle,
  under: { fontSize: 15, letterSpacing: -0.1, color: farge.tekstSekundaer } as TextStyle,
  liten: { fontSize: 13, color: farge.tekstSekundaer } as TextStyle,
  /** Liten etikett over felt og grupper — som .label i nettappen. */
  etikett: { fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", color: farge.tekstTertiaer } as TextStyle,
  stortTall: { fontSize: 52, fontWeight: "700", letterSpacing: -1.5, color: farge.tekst, ...tabellTall } as TextStyle,
} as const;

/** Den myke skyggen kort har i nettappen (--shadow). */
export const skygge: ViewStyle = { boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03)" };
export const skyggeLiten: ViewStyle = { boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)" };
export const skyggeStor: ViewStyle = { boxShadow: "0 8px 32px rgba(0, 0, 0, 0.18)" };
