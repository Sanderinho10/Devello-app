import { Pressable, StyleSheet, Text, View } from "react-native";
import { farge, radius, skrift } from "@/lib/tema";

interface Props {
  tekst: string;
  slag?: "feil" | "advarsel" | "info" | "positiv";
  /** Tekst på en knapp til høyre, for eksempel «Prøv igjen». */
  handling?: string;
  onHandling?: () => void;
}

/** Melding øverst på skjermen. Feil vises her, aldri i Alert. */
export function Banner({ tekst, slag = "feil", handling, onHandling }: Props) {
  return (
    <View style={[s.banner, s[slag]]} accessibilityRole="alert">
      <Text style={[s.tekst, { color: TEKST[slag] }]}>{tekst}</Text>
      {handling && onHandling ? (
        <Pressable onPress={onHandling} hitSlop={8} style={s.knapp}>
          <Text style={[s.knappTekst, { color: TEKST[slag] }]}>{handling}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const TEKST = { feil: farge.negativ, advarsel: farge.advarsel, info: farge.tekstSekundaer, positiv: farge.positiv };

const s = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  feil: { backgroundColor: farge.negativMyk },
  advarsel: { backgroundColor: farge.advarselMyk },
  info: { backgroundColor: farge.kant },
  positiv: { backgroundColor: farge.positivMyk },
  tekst: { flex: 1, fontSize: skrift.normal, fontWeight: "500" },
  knapp: { minHeight: 32, justifyContent: "center" },
  knappTekst: { fontSize: skrift.normal, fontWeight: "700" },
});
