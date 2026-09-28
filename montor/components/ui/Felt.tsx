import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { farge, radius, skrift, trykk } from "@/lib/tema";

interface Props extends TextInputProps {
  etikett?: string;
  /** Tekst under feltet — feil i rødt. */
  feil?: string | null;
}

/** Tekstfelt med etikett. 48 pt høyt, stor tekst, lys bakgrunn. */
export const Felt = forwardRef<TextInput, Props>(function Felt({ etikett, feil, style, multiline, ...rest }, ref) {
  return (
    <View style={s.wrap}>
      {etikett ? <Text style={s.etikett}>{etikett}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={farge.tekstTertiaer}
        multiline={multiline}
        style={[s.felt, multiline && s.flerlinje, feil ? s.feilKant : null, style]}
        {...rest}
      />
      {feil ? <Text style={s.feil}>{feil}</Text> : null}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { gap: 6 },
  etikett: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer, textTransform: "uppercase", letterSpacing: 0.4 },
  felt: {
    minHeight: trykk.minste,
    borderWidth: 1,
    borderColor: farge.kantSterk,
    borderRadius: radius.md,
    backgroundColor: farge.flate,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: skrift.stor,
    color: farge.tekst,
  },
  flerlinje: { minHeight: 120, textAlignVertical: "top" },
  feilKant: { borderColor: farge.negativ },
  feil: { color: farge.negativ, fontSize: skrift.liten },
});
