import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { marg, skrift } from "@/lib/tema";

/** Stor tittel øverst på en hovedskjerm, som i iOS — med en liten linje over (dato, selskap). */
export function Skjermhode({ tittel, over, children }: { tittel: string; over?: string; children?: ReactNode }) {
  const inn = useSafeAreaInsets();
  return (
    <View style={[s.hode, { paddingTop: inn.top + 10 }]}>
      {over ? <Text style={skrift.etikett}>{over}</Text> : null}
      <Text style={skrift.storTittel} accessibilityRole="header">
        {tittel}
      </Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  hode: { paddingHorizontal: marg, paddingBottom: 10, gap: 10 },
});
