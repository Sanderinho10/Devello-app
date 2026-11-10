import { Stack, Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { OrdreHode } from "@/components/OrdreHode";
import { Faner } from "@/components/ui";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, marg } from "@/lib/tema";
import { useOrdreId } from "@/lib/useOrdreId";

type Fane = "timer" | "materiell" | "notater";

/**
 * Én ordre: hodet øverst, så fanene Timer · Materiell · Notater som i Go —
 * tekst på rad med strek under den aktive. Tabs-navigatoren holder fanene i
 * live; den innebygde fanelinja er skrudd av og erstattet av vår egen.
 */
export default function OrdreLayout() {
  const id = useOrdreId();
  const { sammenslaatt } = useOrdreMedUtboks(id);
  const tittel = sammenslaatt.ordre ? `Ordre #${sammenslaatt.ordre.order_no}` : "Ordre";
  const aktive = sammenslaatt.materiell.filter((m) => !m.replaced_by).length;

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
                <Faner
                  valg={[
                    { verdi: "timer", tekst: "Timer", tal: sammenslaatt.timer.length },
                    { verdi: "materiell", tekst: "Materiell", tal: aktive },
                    { verdi: "notater", tekst: "Notater", tal: sammenslaatt.notat.length },
                  ]}
                  verdi={aktiv}
                  onChange={(navn) => navigation.navigate(navn, { id })}
                />
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
  hode: { paddingHorizontal: marg, paddingTop: 4, gap: 6 },
});
