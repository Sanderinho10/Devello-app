import { Stack } from "expo-router";
import { farge } from "@/lib/tema";

export default function OrdrerLayout() {
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
      <Stack.Screen name="index" options={{ title: "Ordrer" }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
