import { StyleSheet, Text, View } from "react-native";
import { farge, radius, skrift } from "@/lib/tema";
import type { UtboksRad } from "@/lib/utboks/typer";

/** «Sendes …» eller «Feilet» på rader som ligger i utboksen. */
export function UtboksMerke({ rad }: { rad: UtboksRad | undefined }) {
  if (!rad) return null;
  const feilet = rad.status === "feil";
  return (
    <View style={[s.merke, feilet ? s.feil : s.venter]}>
      <Text style={[s.tekst, feilet ? s.feilTekst : s.venterTekst]}>{feilet ? "Feilet" : "Sendes …"}</Text>
    </View>
  );
}

/** Grå tekst-merke: «Fra faktura». */
export function Merke({ tekst }: { tekst: string }) {
  return (
    <View style={[s.merke, s.graa]}>
      <Text style={[s.tekst, s.graaTekst]}>{tekst}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  merke: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: "flex-start" },
  venter: { backgroundColor: farge.advarselMyk },
  feil: { backgroundColor: farge.negativMyk },
  graa: { backgroundColor: farge.kant },
  tekst: { fontSize: skrift.liten, fontWeight: "600" },
  venterTekst: { color: farge.advarsel },
  feilTekst: { color: farge.negativ },
  graaTekst: { color: farge.tekstSekundaer },
});
