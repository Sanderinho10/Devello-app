import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { farge, skrift } from "@/lib/tema";
import { Ikon, type IkonNavn } from "./Ikon";

/** Tom liste — et dempet ikon, én setning, og gjerne hva man gjør nå. */
export function Tom({ tekst, under, ikon }: { tekst: string; under?: string; ikon?: IkonNavn }) {
  return (
    <View style={s.wrap}>
      {ikon ? <Ikon navn={ikon} storleik={36} farge={farge.kantSterk} /> : null}
      <Text style={[skrift.overskrift, s.tekst]}>{tekst}</Text>
      {under ? <Text style={[skrift.under, s.tekst]}>{under}</Text> : null}
    </View>
  );
}

export function Laster() {
  return (
    <View style={s.wrap}>
      <ActivityIndicator color={farge.tekstTertiaer} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 48, paddingHorizontal: 32, alignItems: "center", gap: 6 },
  tekst: { textAlign: "center" },
});
