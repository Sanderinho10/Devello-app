import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { marg, skrift } from "@/lib/tema";

/** Stor tittel øverst på en hovedskjerm, som i iOS — med en liten linje over (dato, selskap) og plass til én knapp til høyre. */
export function Skjermhode({ tittel, over, hoyre, children }: { tittel: string; over?: string; hoyre?: ReactNode; children?: ReactNode }) {
  const inn = useSafeAreaInsets();
  return (
    <View style={[s.hode, { paddingTop: inn.top + 10 }]}>
      <View style={s.topp}>
        <View style={s.titler}>
          {over ? <Text style={skrift.etikett}>{over}</Text> : null}
          <Text style={skrift.storTittel} accessibilityRole="header">
            {tittel}
          </Text>
        </View>
        {hoyre}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  hode: { paddingHorizontal: marg, paddingBottom: 10, gap: 10 },
  topp: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  titler: { flex: 1, gap: 10 },
});
