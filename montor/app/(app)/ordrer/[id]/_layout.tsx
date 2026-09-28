import { Stack } from "expo-router";
import { farge } from "@/lib/tema";

/**
 * Én ordre: fanene (Timer · Materiell · Notater) under ordrehodet, og
 * modalene for ny føring over dem.
 */
export default function OrdreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: farge.bakgrunn },
        headerShadowVisible: false,
        headerTintColor: farge.aksent,
        headerTitleStyle: { color: farge.tekst, fontWeight: "700" },
        headerBackTitle: "Ordrer",
        contentStyle: { backgroundColor: farge.bakgrunn },
      }}
    >
      <Stack.Screen name="(faner)" options={{ title: "Ordre" }} />
      <Stack.Screen name="ny-time" options={{ presentation: "modal", title: "Før timer" }} />
      <Stack.Screen name="ny-materiell" options={{ presentation: "modal", title: "Legg til materiell" }} />
      <Stack.Screen name="nytt-notat" options={{ presentation: "modal", title: "Nytt notat" }} />
      <Stack.Screen name="bilete/[docId]" options={{ presentation: "fullScreenModal", title: "Bilde", headerStyle: { backgroundColor: "#000" }, headerTintColor: "#fff", headerTitleStyle: { color: "#fff" } }} />
    </Stack>
  );
}
