import { Pressable, StyleSheet, Text, View } from "react-native";
import { farge, radius } from "@/lib/tema";
import { Ikon, type IkonNavn } from "./Ikon";

type Slag = "feil" | "advarsel" | "info" | "positiv";

interface Props {
  tekst: string;
  slag?: Slag;
  /** Tekst på en knapp til høyre, for eksempel «Prøv igjen». */
  handling?: string;
  onHandling?: () => void;
}

const TEKST: Record<Slag, string> = { feil: farge.negativ, advarsel: farge.advarsel, info: farge.tekstSekundaer, positiv: farge.positiv };
const BAK: Record<Slag, string> = { feil: farge.negativMyk, advarsel: farge.advarselMyk, info: "rgba(0, 0, 0, 0.05)", positiv: farge.positivMyk };
const IKON: Record<Slag, IkonNavn> = { feil: "alert-circle", advarsel: "cloud-offline", info: "information-circle", positiv: "checkmark-circle" };

/** Melding øverst på skjermen. Feil vises her, aldri i Alert. */
export function Banner({ tekst, slag = "feil", handling, onHandling }: Props) {
  return (
    <View style={[s.banner, { backgroundColor: BAK[slag] }]} accessibilityRole="alert">
      <Ikon navn={IKON[slag]} storleik={20} farge={TEKST[slag]} />
      <Text style={[s.tekst, { color: TEKST[slag] }]}>{tekst}</Text>
      {handling && onHandling ? (
        <Pressable accessibilityRole="button" accessibilityLabel={handling} onPress={onHandling} hitSlop={10} style={s.knapp}>
          <Text style={[s.knappTekst, { color: TEKST[slag] }]}>{handling}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md },
  tekst: { flex: 1, fontSize: 15, fontWeight: "500", letterSpacing: -0.1 },
  knapp: { minHeight: 32, justifyContent: "center" },
  knappTekst: { fontSize: 15, fontWeight: "700" },
});
