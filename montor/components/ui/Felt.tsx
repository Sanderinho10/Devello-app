import { useState, type ComponentRef, type Ref } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { farge, radius, skrift, trykk } from "@/lib/tema";

interface Props extends TextInputProps {
  etikett?: string;
  /** Tekst under feltet — feil i rødt. */
  feil?: string | null;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

/** Tekstfelt med etikett over, som i nettappen. 48 pt høyt, blå kant i fokus. */
export function Felt({ etikett, feil, style, multiline, ref, onFocus, onBlur, ...rest }: Props) {
  const [fokus, setFokus] = useState(false);
  return (
    <View style={s.wrap}>
      {etikett ? <Text style={skrift.etikett}>{etikett}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={farge.tekstTertiaer}
        multiline={multiline}
        onFocus={(e) => {
          setFokus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFokus(false);
          onBlur?.(e);
        }}
        style={[s.felt, multiline && s.flerlinje, fokus && s.fokus, feil ? s.feilKant : null, style]}
        {...rest}
      />
      {feil ? <Text style={s.feil}>{feil}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  felt: {
    minHeight: trykk.minste,
    borderWidth: 1,
    borderColor: farge.kantSterk,
    borderRadius: radius.md,
    backgroundColor: farge.flate,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    letterSpacing: -0.2,
    color: farge.tekst,
  },
  flerlinje: { minHeight: 120, textAlignVertical: "top", lineHeight: 24 },
  fokus: { borderColor: farge.aksent, boxShadow: `0 0 0 3px ${farge.aksentMyk}` },
  feilKant: { borderColor: farge.negativ },
  feil: { color: farge.negativ, fontSize: 13 },
});
