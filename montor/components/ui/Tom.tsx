import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { farge, skrift } from "@/lib/tema";

/** Tom liste — én setning, ingen ikon. */
export function Tom({ tekst }: { tekst: string }) {
  return (
    <View style={s.wrap}>
      <Text style={s.tekst}>{tekst}</Text>
    </View>
  );
}

export function Laster() {
  return (
    <View style={s.wrap}>
      <ActivityIndicator color={farge.aksent} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 32, alignItems: "center" },
  tekst: { fontSize: skrift.normal, color: farge.tekstSekundaer, textAlign: "center" },
});
