import { Stack } from "expo-router";
import { farge } from "@/lib/tema";

export default function OrdrerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: farge.bakgrunn },
        headerShadowVisible: false,
        headerTintColor: farge.aksent,
        headerTitleStyle: { color: farge.tekst, fontWeight: "600" },
        headerBackTitle: "Ordrer",
        contentStyle: { backgroundColor: farge.bakgrunn },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Ordre" }} />
    </Stack>
  );
}
