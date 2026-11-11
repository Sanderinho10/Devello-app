import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { feilTekst } from "@/lib/api";
import { useFilLenke } from "@/lib/sporringar";
import { farge } from "@/lib/tema";

/** Bildet i fullskjerm. Lokal fil fra utboksen (uri) eller signert lenke fra serveren. Parametre: ordre, doc, uri. */
export default function Bilete() {
  const { ordre = "", doc = "", uri } = useLocalSearchParams<{ ordre: string; doc: string; uri?: string }>();
  const lenke = useFilLenke(ordre, uri ? null : doc);
  const kilde = uri || lenke.data;

  return (
    <View style={s.fyll}>
      {kilde ? (
        <Image source={{ uri: kilde }} style={s.bilde} resizeMode="contain" />
      ) : lenke.error ? (
        <Text style={s.feil}>{feilTekst(lenke.error)}</Text>
      ) : (
        <ActivityIndicator color={farge.hvit} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  bilde: { width: "100%", height: "100%" },
  feil: { color: farge.hvit, fontSize: 16, padding: 24, textAlign: "center" },
});
