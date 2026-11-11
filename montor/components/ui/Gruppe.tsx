import { Children, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { farge, radius, skrift, skygge } from "@/lib/tema";
import { Ikon } from "./Ikon";

/**
 * Gruppert liste, som i iOS: én hvit flate med rader og tynne skillelinjer
 * mellom. Tettere enn ett kort per rad — mer å se på én gang, som i Go.
 */
export function Gruppe({ children, tittel, hoyre, style }: { children: ReactNode; tittel?: string; hoyre?: string; style?: StyleProp<ViewStyle> }) {
  const rader = Children.toArray(children);
  return (
    <View style={style}>
      {tittel || hoyre ? (
        <View style={s.hode}>
          <Text style={skrift.etikett}>{tittel}</Text>
          {hoyre ? <Text style={[skrift.etikett, s.hoyre]}>{hoyre}</Text> : null}
        </View>
      ) : null}
      <View style={s.gruppe}>
        {rader.map((rad, i) => (
          <View key={i}>
            {i > 0 ? <View style={s.skille} /> : null}
            {rad}
          </View>
        ))}
      </View>
    </View>
  );
}

interface RadProps {
  children: ReactNode;
  onPress?: () => void;
  /** Vis pil til høyre — raden fører videre. */
  pil?: boolean;
  /** Det som står helt til høyre, før pilen: et tall, en pille. */
  hoyre?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Én rad i en gruppe. Trykkbar når onPress er satt. */
export function Rad({ children, onPress, pil, hoyre, style }: RadProps) {
  const innhold = (
    <>
      <View style={s.innhold}>{children}</View>
      {hoyre ? <View style={s.radHoyre}>{hoyre}</View> : null}
      {pil ? <Ikon navn="chevron-forward" storleik={18} farge={farge.kantSterk} /> : null}
    </>
  );
  if (!onPress) return <View style={[s.rad, style]}>{innhold}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.rad, pressed && s.trykket, style]}>
      {innhold}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hode: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 4, marginBottom: 8 },
  hoyre: { textTransform: "none", letterSpacing: 0 },
  gruppe: {
    backgroundColor: farge.flate,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: farge.kant,
    overflow: "hidden",
    ...skygge,
  },
  skille: { height: StyleSheet.hairlineWidth, backgroundColor: farge.kantSterk, marginLeft: 16 },
  rad: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
  trykket: { backgroundColor: farge.flateSenket },
  innhold: { flex: 1, gap: 2 },
  radHoyre: { alignItems: "flex-end" },
});
