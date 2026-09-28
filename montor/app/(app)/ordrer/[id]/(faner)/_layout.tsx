import { Stack, Tabs, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { OrdreHode } from "@/components/OrdreHode";
import { Segment } from "@/components/ui";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge } from "@/lib/tema";

const FANER = [
  { verdi: "timer", tekst: "Timer" },
  { verdi: "materiell", tekst: "Materiell" },
  { verdi: "notater", tekst: "Notater" },
] as const;

type Fane = (typeof FANER)[number]["verdi"];

/**
 * Ordrehodet + segmentkontroll øverst, faneinnholdet under. Tabs-navigatoren
 * holder fanene i live, mens den innebygde fanelinja er skrudd av og
 * erstattet av vår egen i «layout».
 */
export default function FaneLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sammenslaatt } = useOrdreMedUtboks(id);
  const tittel = sammenslaatt.ordre ? `#${sammenslaatt.ordre.order_no}` : "Ordre";

  return (
    <>
      <Stack.Screen options={{ title: tittel }} />
      <Tabs
        tabBar={() => null}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: farge.bakgrunn } }}
        layout={({ children, state, navigation }) => {
          const aktiv = state.routes[state.index]?.name as Fane;
          return (
            <View style={s.fyll}>
              <View style={s.hode}>
                <OrdreHode id={id} />
                <Segment valg={[...FANER]} verdi={aktiv} onChange={(navn) => navigation.navigate(navn)} />
              </View>
              <View style={s.fyll}>{children}</View>
            </View>
          );
        }}
      >
        <Tabs.Screen name="timer" options={{ title: "Timer" }} />
        <Tabs.Screen name="materiell" options={{ title: "Materiell" }} />
        <Tabs.Screen name="notater" options={{ title: "Notater" }} />
      </Tabs>
    </>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  hode: { paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
});
