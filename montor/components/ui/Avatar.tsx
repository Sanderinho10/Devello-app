import { StyleSheet, Text, View } from "react-native";
import { farge } from "@/lib/tema";

function forbokstaver(navn: string): string {
  const deler = navn.trim().split(/[\s@.]+/).filter(Boolean);
  if (!deler.length) return "?";
  return (deler[0][0] + (deler.length > 1 ? deler[deler.length - 1][0] : "")).toUpperCase();
}

/** Rund brikke med forbokstavene — hvem som skrev notatet, hvem som er innlogget. */
export function Avatar({ navn, storleik = 36 }: { navn: string; storleik?: number }) {
  return (
    <View style={[s.sirkel, { width: storleik, height: storleik, borderRadius: storleik / 2 }]}>
      <Text style={[s.tekst, { fontSize: storleik * 0.38 }]}>{forbokstaver(navn)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  sirkel: { backgroundColor: farge.fyll, alignItems: "center", justifyContent: "center" },
  tekst: { fontWeight: "600", color: farge.tekstSekundaer, letterSpacing: -0.2 },
});
