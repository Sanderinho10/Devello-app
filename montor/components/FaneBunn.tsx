import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Knapp } from "@/components/ui";
import { farge } from "@/lib/tema";

/** Den store, faste knappen nederst i en fane. */
export function FaneBunn({ tekst, onPress }: { tekst: string; onPress: () => void }) {
  const inn = useSafeAreaInsets();
  return (
    <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
      <Knapp tekst={tekst} onPress={onPress} stor />
    </View>
  );
}

const s = StyleSheet.create({
  bunn: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: farge.bakgrunn,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: farge.kant,
  },
});

/** Plass nederst i lista så den siste raden ikke ligger under knappen. */
export const BUNN_PLASS = 24;
