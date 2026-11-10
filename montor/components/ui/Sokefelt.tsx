import type { ComponentRef, Ref } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { farge, radius, trykk } from "@/lib/tema";
import { Ikon } from "./Ikon";

interface Props extends Omit<TextInputProps, "style"> {
  value: string;
  onChangeText: (t: string) => void;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

/** Søkefeltet fra iOS: grå flate, lupe til venstre, «Tøm» når det står noe. */
export function Sokefelt({ value, onChangeText, ref, ...rest }: Props) {
  return (
    <View style={s.wrap}>
      <Ikon navn="search" storleik={18} farge={farge.tekstTertiaer} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={farge.tekstTertiaer}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={s.felt}
        {...rest}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Tøm søket" onPress={() => onChangeText("")} hitSlop={12} style={s.toem}>
          <Text style={s.toemTekst}>Tøm</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: trykk.minste,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: farge.fyll,
  },
  felt: { flex: 1, minHeight: trykk.minste, fontSize: 17, letterSpacing: -0.2, color: farge.tekst, paddingVertical: 0 },
  toem: { minHeight: 32, justifyContent: "center" },
  toemTekst: { fontSize: 15, fontWeight: "500", color: farge.aksent },
});
