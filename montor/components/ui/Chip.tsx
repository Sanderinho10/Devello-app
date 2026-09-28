import { Pressable, StyleSheet, Text } from "react-native";
import { farge, radius, skrift, trykk } from "@/lib/tema";

interface Props {
  tekst: string;
  valgt?: boolean;
  onPress: () => void;
  /** Ekstra bred — timetyper og hurtigvalg. */
  stor?: boolean;
}

/** Valgknapp i en rad av valg. 48 pt høy, tydelig valgt-tilstand. */
export function Chip({ tekst, valgt, onPress, stor }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!valgt }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, stor && s.stor, valgt && s.valgt, pressed && s.trykket]}
    >
      <Text style={[s.tekst, valgt && s.valgtTekst]}>{tekst}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    minHeight: trykk.minste,
    paddingHorizontal: 18,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: farge.kantSterk,
    backgroundColor: farge.flate,
    alignItems: "center",
    justifyContent: "center",
  },
  stor: { paddingHorizontal: 24, minHeight: trykk.primaer },
  valgt: { backgroundColor: farge.aksent, borderColor: farge.aksent },
  trykket: { opacity: 0.8 },
  tekst: { fontSize: skrift.stor, fontWeight: "600", color: farge.tekst },
  valgtTekst: { color: farge.hvit },
});
