import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Knapp, Laster } from "@/components/ui";
import { ApiFeil, feilTekst } from "@/lib/api";
import { useMeg } from "@/lib/sporringar";
import { supabase } from "@/lib/supabase";
import { farge, skrift } from "@/lib/tema";

/**
 * Innlogget del: Ordrer · Meg. Første kall er GET /api/app/meg — 403 betyr
 * at selskapet ikke har ordre-modulen, og da er det bare «Logg ut» igjen.
 */
export default function AppLayout() {
  const meg = useMeg();
  const inn = useSafeAreaInsets();

  if (meg.error instanceof ApiFeil && meg.error.status === 403) {
    return (
      <View style={[s.senter, { paddingTop: inn.top + 48, paddingBottom: inn.bottom + 24 }]}>
        <Text style={s.tittel}>Ordre-modulen er ikke aktivert for dette selskapet</Text>
        <Text style={s.tekst}>{meg.error.melding}</Text>
        <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={() => supabase.auth.signOut()} />
      </View>
    );
  }

  if (!meg.data) {
    return (
      <View style={[s.senter, { paddingTop: inn.top + 48, paddingBottom: inn.bottom + 24 }]}>
        {meg.error ? (
          <>
            <Banner tekst={feilTekst(meg.error)} handling="Prøv igjen" onHandling={() => meg.refetch()} />
            <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={() => supabase.auth.signOut()} />
          </>
        ) : (
          <Laster />
        )}
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: farge.aksent,
        tabBarInactiveTintColor: farge.tekstSekundaer,
        tabBarStyle: { backgroundColor: farge.flate, borderTopColor: farge.kant, height: 60 + inn.bottom },
        tabBarLabelStyle: { fontSize: 15, fontWeight: "600" },
        tabBarIconStyle: { display: "none" },
        tabBarLabelPosition: "beside-icon",
      }}
    >
      <Tabs.Screen name="ordrer" options={{ title: "Ordrer" }} />
      <Tabs.Screen name="meg" options={{ title: "Meg" }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  senter: { flex: 1, backgroundColor: farge.bakgrunn, paddingHorizontal: 20, gap: 16, justifyContent: "center" },
  tittel: { fontSize: skrift.tittel, fontWeight: "700", color: farge.tekst },
  tekst: { fontSize: skrift.normal, color: farge.tekstSekundaer },
});
