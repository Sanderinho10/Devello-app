import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { settMerke } from "@/lib/push";
import { useVarsel } from "@/lib/sporringar";
import { farge } from "@/lib/tema";
import { antall, useUtboks } from "@/lib/utboks/db";

/** Fanene nederst: Program · Ordrer · Meg. Merket på «Program» er uleste varsler, på «Meg» det som ligger usendt. */
export default function FaneLayout() {
  const n = antall(useUtboks());
  const usendt = n.venter + n.sender + n.feil;
  const inn = useSafeAreaInsets();
  const ulest = useVarsel().data?.ulest ?? 0;

  // Tallet på app-ikonet følger antall uleste varsler.
  useEffect(() => {
    settMerke(ulest);
  }, [ulest]);

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
          tabBarBadge: ulest > 0 ? ulest : undefined,
          tabBarBadgeStyle: { backgroundColor: farge.negativ, color: farge.hvit, fontSize: 11 },
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
