import { useLocalSearchParams } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { feilTekst } from "@/lib/api";
import { useFilLenke } from "@/lib/sporringar";
import { farge, skrift } from "@/lib/tema";

/** Bildet i fullskjerm. Lokal fil fra utboksen (uri) eller signert lenke fra serveren. */
export default function Bilete() {
  const id = useOrdreId();
  const { docId, uri } = useLocalSearchParams<{ docId: string; uri?: string }>();
  const lenke = useFilLenke(id, uri ? null : docId);
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
  feil: { color: farge.hvit, fontSize: skrift.normal, padding: 24, textAlign: "center" },
});
