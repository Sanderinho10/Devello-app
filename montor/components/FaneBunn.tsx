import { StyleSheet, View } from "react-native";
import { Knapp, type IkonNavn } from "@/components/ui";
import { farge, marg } from "@/lib/tema";

/** Den store, faste knappen nederst i en fane på ordren. */
export function FaneBunn({ tekst, ikon = "add", onPress }: { tekst: string; ikon?: IkonNavn; onPress: () => void }) {
  return (
    <View style={s.bunn}>
      <Knapp tekst={tekst} ikon={ikon} onPress={onPress} stor />
    </View>
  );
}

const s = StyleSheet.create({
  bunn: {
    paddingHorizontal: marg,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: farge.bakgrunn,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: farge.kantSterk,
  },
});
