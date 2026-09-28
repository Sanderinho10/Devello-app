import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { farge, radius } from "@/lib/tema";

interface Props {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Hvit flate med avrundede hjørner. Trykkbar når onPress er satt. */
export function Kort({ children, onPress, onLongPress, style }: Props) {
  if (onPress || onLongPress) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        style={({ pressed }) => [s.kort, pressed && s.trykket, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.kort, style]}>{children}</View>;
}

const s = StyleSheet.create({
  kort: {
    backgroundColor: farge.flate,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: farge.kant,
  },
  trykket: { backgroundColor: farge.flateSenket },
});
