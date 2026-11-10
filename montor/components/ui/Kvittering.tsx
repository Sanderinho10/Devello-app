import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKvittering } from "@/lib/kvittering";
import { farge, radius, skyggeStor } from "@/lib/tema";
import { Ikon } from "./Ikon";

/** «7,5 t lagret» — står øverst i to sekunder når noe er lagt i utboksen. Øverst, så den aldri dekker knappene. */
export function Kvittering() {
  const k = useKvittering();
  const inn = useSafeAreaInsets();
  if (!k) return null;
  return (
    <View style={[s.wrap, { top: inn.top + 8 }]} pointerEvents="none">
      <View style={s.boble} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <Ikon navn="checkmark-circle" storleik={20} farge="#30d158" />
        <Text style={s.tekst}>{k.tekst}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 100 },
  boble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.kapsel,
    backgroundColor: "rgba(29, 29, 31, 0.94)",
    ...skyggeStor,
  },
  tekst: { color: farge.hvit, fontSize: 15, fontWeight: "600", letterSpacing: -0.1 },
});
