import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { farge, radius, skrift, trykk } from "@/lib/tema";

type Variant = "primaer" | "sekundaer" | "fare" | "lenke";

interface Props {
  tekst: string;
  onPress: () => void;
  variant?: Variant;
  /** 56 pt høy, full bredde — nederst på skjermen. */
  stor?: boolean;
  deaktivert?: boolean;
  laster?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Knapp med tekst. Minste trykkflate 48 pt, primærknappen 56 pt. */
export function Knapp({ tekst, onPress, variant = "primaer", stor, deaktivert, laster, style }: Props) {
  const av = deaktivert || laster;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!av }}
      onPress={onPress}
      disabled={av}
      style={({ pressed }) => [
        s.base,
        s[variant],
        stor && s.stor,
        pressed && s.trykket,
        av && s.av,
        style,
      ]}
    >
      {laster ? (
        <ActivityIndicator color={variant === "primaer" || variant === "fare" ? farge.hvit : farge.aksent} />
      ) : (
        <Text style={[s.tekst, s[`${variant}Tekst`], stor && s.storTekst]}>{tekst}</Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: {
    minHeight: trykk.minste,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  stor: { minHeight: trykk.primaer, borderRadius: radius.lg, alignSelf: "stretch" },
  trykket: { opacity: 0.75 },
  av: { opacity: 0.45 },
  primaer: { backgroundColor: farge.aksent },
  sekundaer: { backgroundColor: farge.flate, borderWidth: 1, borderColor: farge.kantSterk },
  fare: { backgroundColor: farge.negativ },
  lenke: { backgroundColor: "transparent" },
  tekst: { fontSize: skrift.normal, fontWeight: "600" },
  storTekst: { fontSize: skrift.stor },
  primaerTekst: { color: farge.hvit },
  sekundaerTekst: { color: farge.tekst },
  fareTekst: { color: farge.hvit },
  lenkeTekst: { color: farge.aksent },
});
