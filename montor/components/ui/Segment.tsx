import { Pressable, StyleSheet, Text, View } from "react-native";
import { valg as dunk } from "@/lib/haptikk";
import { farge, radius, skyggeLiten } from "@/lib/tema";

interface Props<T extends string> {
  valg: { verdi: T; tekst: string; tal?: number }[];
  verdi: T;
  onChange: (v: T) => void;
}

/** Segmentkontroll — .type-switch i nettappen. Grå bane, hvit brikke på det valgte. */
export function Segment<T extends string>({ valg, verdi, onChange }: Props<T>) {
  return (
    <View style={s.rad} accessibilityRole="tablist">
      {valg.map((v) => {
        const aktiv = v.verdi === verdi;
        return (
          <Pressable
            key={v.verdi}
            accessibilityRole="tab"
            accessibilityLabel={v.tekst}
            accessibilityState={{ selected: aktiv }}
            onPress={() => {
              if (!aktiv) dunk();
              onChange(v.verdi);
            }}
            style={[s.del, aktiv && s.aktiv]}
          >
            <Text style={[s.tekst, aktiv && s.aktivTekst]}>{v.tekst}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Faner som i Go: tekst på rad, mørk strek under den aktive, tynn linje
 * under hele raden. Brukes der fanene er deler av samme sak (en ordre).
 */
export function Faner<T extends string>({ valg, verdi, onChange }: Props<T>) {
  return (
    <View style={s.faner} accessibilityRole="tablist">
      {valg.map((v) => {
        const aktiv = v.verdi === verdi;
        return (
          <Pressable
            key={v.verdi}
            accessibilityRole="tab"
            accessibilityLabel={v.tekst}
            accessibilityState={{ selected: aktiv }}
            onPress={() => {
              if (!aktiv) dunk();
              onChange(v.verdi);
            }}
            style={[s.fane, aktiv && s.faneAktiv]}
          >
            <Text style={[s.faneTekst, aktiv && s.faneAktivTekst]}>{v.tekst}</Text>
            {v.tal ? <Text style={s.faneTal}>{v.tal}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  rad: { flexDirection: "row", backgroundColor: farge.fyll, borderRadius: radius.md, padding: 3, gap: 3 },
  del: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  aktiv: { backgroundColor: farge.flate, ...skyggeLiten },
  tekst: { fontSize: 15, fontWeight: "500", letterSpacing: -0.1, color: farge.tekstSekundaer },
  aktivTekst: { color: farge.tekst, fontWeight: "600" },
  faner: { flexDirection: "row", gap: 28, borderBottomWidth: 1, borderBottomColor: farge.kantSterk },
  fane: { flexDirection: "row", alignItems: "baseline", gap: 6, minHeight: 46, paddingTop: 12, paddingHorizontal: 2, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: "transparent" },
  faneAktiv: { borderBottomColor: farge.tekst },
  faneTekst: { fontSize: 16, letterSpacing: -0.2, color: farge.tekstSekundaer },
  faneAktivTekst: { color: farge.tekst, fontWeight: "600" },
  faneTal: { fontSize: 13, color: farge.tekstTertiaer, fontVariant: ["tabular-nums"] },
});
