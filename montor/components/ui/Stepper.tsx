import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { lesTall, tall } from "@/lib/format";
import { farge, radius, skrift, tabellTall, trykk } from "@/lib/tema";

interface Props {
  verdi: number;
  onChange: (n: number) => void;
  /** Hvor mye −/+ endrer. */
  steg: number;
  minste?: number;
  /** Står ved tallet: «t», «m», «stk». */
  enhet?: string;
}

/**
 * Stor tallvisning med −/+ på hver side. Tastaturet kommer bare når man
 * trykker på selve tallet — ellers er det knappene som gjelder.
 */
export function Stepper({ verdi, onChange, steg, minste = 0, enhet }: Props) {
  const [redigerer, setRedigerer] = useState(false);
  const [tekst, setTekst] = useState("");

  const sett = (n: number) => onChange(Math.max(minste, Math.round(n * 1000) / 1000));

  const ferdig = () => {
    const n = lesTall(tekst);
    if (n !== null) sett(n);
    setRedigerer(false);
  };

  return (
    <View style={s.rad}>
      <Pressable accessibilityRole="button" accessibilityLabel="Mindre" onPress={() => sett(verdi - steg)} style={({ pressed }) => [s.knapp, pressed && s.trykket]}>
        <Text style={s.knappTekst}>−</Text>
      </Pressable>
      {redigerer ? (
        <TextInput
          autoFocus
          keyboardType="decimal-pad"
          value={tekst}
          onChangeText={setTekst}
          onBlur={ferdig}
          onSubmitEditing={ferdig}
          selectTextOnFocus
          style={[s.tall, s.felt]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skriv inn tall"
          onPress={() => {
            setTekst(tall(verdi, 3));
            setRedigerer(true);
          }}
          style={s.tallWrap}
        >
          <Text style={s.tall}>{tall(verdi, 3)}</Text>
          {enhet ? <Text style={s.enhet}>{enhet}</Text> : null}
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Mer" onPress={() => sett(verdi + steg)} style={({ pressed }) => [s.knapp, pressed && s.trykket]}>
        <Text style={s.knappTekst}>+</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  rad: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  knapp: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: farge.flate,
    borderWidth: 1,
    borderColor: farge.kantSterk,
    alignItems: "center",
    justifyContent: "center",
  },
  trykket: { backgroundColor: farge.aksentMyk },
  knappTekst: { fontSize: 34, color: farge.tekst, lineHeight: 40 },
  tallWrap: { flex: 1, minHeight: trykk.primaer, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 },
  tall: { fontSize: skrift.tall, fontWeight: "700", color: farge.tekst, ...tabellTall },
  felt: { flex: 1, textAlign: "center", borderBottomWidth: 2, borderColor: farge.aksent, paddingVertical: 0 },
  enhet: { fontSize: skrift.stor, color: farge.tekstSekundaer },
});
