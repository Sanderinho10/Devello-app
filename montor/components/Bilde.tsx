import { Image, Pressable, StyleSheet, View } from "react-native";
import { UtboksMerke } from "@/components/ui";
import { useFilLenke, type BileteRad } from "@/lib/sporringar";
import { farge, radius } from "@/lib/tema";

interface Props {
  ordreId: string;
  bilde: BileteRad;
  storleik?: number;
  onPress?: () => void;
}

/** Miniatyr av et bilde — lokal fil i utboksen, eller signert lenke fra serveren (4 min i minnet). */
export function Miniatyr({ ordreId, bilde, storleik = 72, onPress }: Props) {
  const lenke = useFilLenke(ordreId, bilde.lokal_uri ? null : bilde.id);
  const uri = bilde.lokal_uri ?? lenke.data;
  return (
    <Pressable onPress={onPress} disabled={!onPress || !uri} style={[s.wrap, { width: storleik, height: storleik }]}>
      {uri ? <Image source={{ uri }} style={s.bilde} resizeMode="cover" /> : <View style={s.bilde} />}
      {bilde._utboks ? (
        <View style={s.merke}>
          <UtboksMerke rad={bilde._utboks} />
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: radius.sm, overflow: "hidden", backgroundColor: farge.kant },
  bilde: { width: "100%", height: "100%" },
  merke: { position: "absolute", left: 4, bottom: 4 },
});
