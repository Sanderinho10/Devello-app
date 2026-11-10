import { Pressable, StyleSheet, Text } from "react-native";
import { valg as dunk } from "@/lib/haptikk";
import { farge, radius, trykk } from "@/lib/tema";

interface Props {
  tekst: string;
  valgt?: boolean;
  onPress: () => void;
}

/** Valgknapp i en rad av valg: kapsel, 48 pt høy, fylt blå når den er valgt. */
export function Chip({ tekst, valgt, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tekst}
      accessibilityState={{ selected: !!valgt }}
      onPress={() => {
        if (!valgt) dunk();
        onPress();
      }}
      style={({ pressed }) => [s.chip, valgt && s.valgt, pressed && !valgt && s.trykket]}
    >
      <Text style={[s.tekst, valgt && s.valgtTekst]}>{tekst}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    minHeight: trykk.minste,
    paddingHorizontal: 18,
    borderRadius: radius.kapsel,
    backgroundColor: farge.fyll,
    alignItems: "center",
    justifyContent: "center",
  },
  valgt: { backgroundColor: farge.aksent },
  trykket: { backgroundColor: farge.fyllTrykket },
  tekst: { fontSize: 16, fontWeight: "500", letterSpacing: -0.2, color: farge.tekst },
  valgtTekst: { color: farge.hvit, fontWeight: "600" },
});
