import { Pressable, StyleSheet, Text, View } from "react-native";
import { farge, radius, skrift, trykk } from "@/lib/tema";

interface Props<T extends string> {
  valg: { verdi: T; tekst: string }[];
  verdi: T;
  onChange: (v: T) => void;
}

/** Segmentkontroll — Pågår · Åpne · Ferdige, eller Timer · Materiell · Notater. */
export function Segment<T extends string>({ valg, verdi, onChange }: Props<T>) {
  return (
    <View style={s.rad}>
      {valg.map((v) => {
        const aktiv = v.verdi === verdi;
        return (
          <Pressable
            key={v.verdi}
            accessibilityRole="tab"
            accessibilityState={{ selected: aktiv }}
            onPress={() => onChange(v.verdi)}
            style={[s.del, aktiv && s.aktiv]}
          >
            <Text style={[s.tekst, aktiv && s.aktivTekst]}>{v.tekst}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  rad: { flexDirection: "row", backgroundColor: farge.kant, borderRadius: radius.md, padding: 3 },
  del: { flex: 1, minHeight: trykk.minste - 6, alignItems: "center", justifyContent: "center", borderRadius: radius.md - 3 },
  aktiv: { backgroundColor: farge.flate, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tekst: { fontSize: skrift.normal, fontWeight: "600", color: farge.tekstSekundaer },
  aktivTekst: { color: farge.tekst },
});
