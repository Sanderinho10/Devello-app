import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { lesTall, tall } from "@/lib/format";
import { valg as dunk } from "@/lib/haptikk";
import { farge, radius, skrift } from "@/lib/tema";

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

  const sett = (n: number) => {
    dunk();
    onChange(Math.max(minste, Math.round(n * 1000) / 1000));
  };

  const ferdig = () => {
    const n = lesTall(tekst);
    if (n !== null) onChange(Math.max(minste, Math.round(n * 1000) / 1000));
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
          style={[skrift.stortTall, s.felt]}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tall(verdi, 3)} ${enhet ?? ""}. Trykk for å skrive inn tall`}
          onPress={() => {
            setTekst(tall(verdi, 3));
            setRedigerer(true);
          }}
          style={s.tallWrap}
        >
          <Text style={skrift.stortTall}>{tall(verdi, 3)}</Text>
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
  knapp: { width: 64, height: 64, borderRadius: radius.kapsel, backgroundColor: farge.fyll, alignItems: "center", justifyContent: "center" },
  trykket: { backgroundColor: farge.fyllTrykket },
  knappTekst: { fontSize: 32, fontWeight: "400", color: farge.tekst, lineHeight: 38 },
  tallWrap: { flex: 1, minHeight: 64, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 6 },
  felt: { flex: 1, textAlign: "center", borderBottomWidth: 2, borderColor: farge.aksent, paddingVertical: 0, minHeight: 64 },
  enhet: { fontSize: 20, fontWeight: "500", color: farge.tekstSekundaer },
});
