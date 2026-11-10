import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { farge } from "@/lib/tema";
import { antall, useUtboks } from "@/lib/utboks/db";

/** Fanene nederst: Program · Ordrer · Meg. Merket på «Meg» er det som ligger usendt. */
export default function FaneLayout() {
  const n = antall(useUtboks());
  const usendt = n.venter + n.sender + n.feil;
  const inn = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: farge.aksent,
        tabBarInactiveTintColor: farge.tekstTertiaer,
        tabBarStyle: { backgroundColor: farge.flate, borderTopColor: farge.kant, height: 64 + inn.bottom, paddingTop: 8 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        sceneStyle: { backgroundColor: farge.bakgrunn },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Program",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="ordrer"
        options={{
          title: "Ordrer",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={24} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="meg"
        options={{
          title: "Meg",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={26} color={color as string} />,
          tabBarBadge: usendt > 0 ? usendt : undefined,
          tabBarBadgeStyle: { backgroundColor: n.feil > 0 ? farge.negativ : farge.advarsel, color: farge.hvit, fontSize: 11 },
        }}
      />
    </Tabs>
  );
}
