import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { farge, radius, trykk } from "@/lib/tema";
import { Ikon, type IkonNavn } from "./Ikon";

type Variant = "primaer" | "tonet" | "sekundaer" | "fare" | "lenke";

interface Props {
  tekst: string;
  onPress: () => void;
  variant?: Variant;
  /** 54 pt høy, full bredde — nederst på skjermen. */
  stor?: boolean;
  ikon?: IkonNavn;
  deaktivert?: boolean;
  laster?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TEKSTFARGE: Record<Variant, string> = {
  primaer: farge.hvit,
  tonet: farge.aksent,
  sekundaer: farge.tekst,
  fare: farge.negativ,
  lenke: farge.aksent,
};

/** Kapselknapp som i nettappen. Minste trykkflate 48 pt, primærknappen 54 pt. */
export function Knapp({ tekst, onPress, variant = "primaer", stor, ikon, deaktivert, laster, style }: Props) {
  const av = deaktivert || laster;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tekst}
      accessibilityState={{ disabled: !!av }}
      onPress={onPress}
      disabled={av}
      style={({ pressed }) => [s.base, s[variant], stor && s.stor, pressed && (variant === "primaer" ? s.primaerTrykket : s.trykket), av && s.av, style]}
    >
      {laster ? (
        <ActivityIndicator color={TEKSTFARGE[variant]} />
      ) : (
        <>
          {ikon ? <Ikon navn={ikon} storleik={stor ? 20 : 18} farge={TEKSTFARGE[variant]} /> : null}
          <Text style={[s.tekst, stor && s.storTekst, { color: TEKSTFARGE[variant] }]} numberOfLines={1}>
            {tekst}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    minHeight: trykk.minste,
    paddingHorizontal: 20,
    borderRadius: radius.kapsel,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  stor: { minHeight: trykk.primaer, alignSelf: "stretch" },
  trykket: { backgroundColor: farge.fyllTrykket },
  primaerTrykket: { backgroundColor: farge.aksentTrykket },
  av: { opacity: 0.45 },
  primaer: { backgroundColor: farge.aksent },
  // Viktig, men ikke skjermens hovedhandling: blå tekst på lys blå flate.
  tonet: { backgroundColor: farge.aksentMyk },
  sekundaer: { backgroundColor: farge.fyll },
  fare: { backgroundColor: farge.negativMyk },
  lenke: { backgroundColor: "transparent", paddingHorizontal: 12 },
  tekst: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  storTekst: { fontSize: 17 },
});
