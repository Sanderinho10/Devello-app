import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Felt, Gruppe, Knapp, Rad } from "@/components/ui";
import { tall } from "@/lib/format";
import { valg as dunk } from "@/lib/haptikk";
import { kvitter } from "@/lib/kvittering";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, marg, radius, skrift, tabellTall } from "@/lib/tema";
import { endringsNotat } from "@/lib/tilbudsendring";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

/**
 * Endring fra tilbudet: hva ble annerledes enn det kunden sa ja til.
 *
 * Postene fra tilbudet står med antallet som var avtalt. Montøren retter
 * antallet der jobben ble en annen (− / +), og skriver det som kom i
 * tillegg. Lagre → ett notat på ordren, gjennom utboksen som alle andre
 * notater, så det virker uten dekning. Tilbudet røres ikke. Parameter: ordre.
 */
export default function Endring() {
  const { ordre: ordreId = "" } = useLocalSearchParams<{ ordre: string }>();
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const { sammenslaatt } = useOrdreMedUtboks(ordreId);
  const linjer = useMemo(
    () => (sammenslaatt.tilbud?.sections ?? []).flatMap((s) => s.lines.map((l) => ({ ...l, seksjon: s.title }))),
    [sammenslaatt.tilbud],
  );
  // Bare det som er rettet står her; resten har antallet fra tilbudet.
  const [nye, setNye] = useState<Record<number, number>>({});
  const [kommentar, setKommentar] = useState("");
  const [feil, setFeil] = useState<string | null>(null);
  const [jobber, setJobber] = useState(false);

  const tekst = endringsNotat(
    linjer.map((l, i) => ({ description: l.description, unit: l.unit, quantity: l.quantity, ny: nye[i] ?? l.quantity })),
    kommentar,
  );

  const endre = (i: number, delta: number) => {
    dunk();
    setNye((n) => {
      const naa = n[i] ?? linjer[i].quantity;
      return { ...n, [i]: Math.max(0, Math.round((naa + delta) * 100) / 100) };
    });
  };

  const lagre = async () => {
    if (!tekst) return setFeil("Rett et antall eller skriv en kommentar først.");
    if (tekst.length > 4000) return setFeil("Notatet blir for langt. Kort ned kommentaren.");
    setJobber(true);
    try {
      await leggTil({ ordre_id: ordreId, type: "notat", payload: { text: tekst } });
      kjoer();
      router.back();
      kvitter("Endringen er lagret som notat");
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke lagre.");
      setJobber(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {feil ? <Banner tekst={feil} /> : null}
        <Text style={skrift.under}>Rett antallet der jobben ble annerledes enn tilbudet. Endringene lagres som et notat på ordren — tilbudet står som det er.</Text>
        {linjer.length ? (
          <Gruppe tittel="Postene i tilbudet" hoyre="Antall">
            {linjer.map((l, i) => {
              const ny = nye[i] ?? l.quantity;
              const endret = ny !== l.quantity;
              return (
                <Rad key={i} style={s.rad}>
                  <Text style={s.post}>{l.description}</Text>
                  <View style={s.linje}>
                    <Text style={[skrift.under, tabellTall]}>
                      Tilbud: {tall(l.quantity)} {l.unit}
                    </Text>
                    <View style={s.stepper}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mindre ${l.description}`} hitSlop={6} onPress={() => endre(i, -1)} style={({ pressed }) => [s.knapp, pressed && s.trykket]}>
                        <Text style={s.knappTekst}>−</Text>
                      </Pressable>
                      <Text style={[s.antall, endret && s.antallEndret]}>
                        {tall(ny)} {l.unit}
                      </Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Mer ${l.description}`} hitSlop={6} onPress={() => endre(i, 1)} style={({ pressed }) => [s.knapp, pressed && s.trykket]}>
                        <Text style={s.knappTekst}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                </Rad>
              );
            })}
          </Gruppe>
        ) : null}
        <Felt
          etikett="Tillegg eller kommentar"
          multiline
          value={kommentar}
          onChangeText={setKommentar}
          placeholder="To ekstra stikk på kjøkkenet, avtalt med kunden på stedet."
          style={s.kommentar}
        />
        {tekst ? (
          <View style={s.forhaand}>
            <Text style={skrift.etikett}>Notatet som lagres</Text>
            <Text style={s.forhaandTekst}>{tekst}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Lagre som notat" stor onPress={lagre} laster={jobber} deaktivert={!tekst} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 24, gap: 16 },
  rad: { paddingVertical: 12 },
  post: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: farge.tekst },
  linje: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  knapp: { width: 48, height: 48, borderRadius: radius.kapsel, backgroundColor: farge.fyll, alignItems: "center", justifyContent: "center" },
  trykket: { backgroundColor: farge.fyllTrykket },
  knappTekst: { fontSize: 26, color: farge.tekst, lineHeight: 30 },
  antall: { minWidth: 76, textAlign: "center", fontSize: 17, fontWeight: "600", color: farge.tekst, ...tabellTall },
  antallEndret: { color: farge.aksent },
  kommentar: { minHeight: 96 },
  forhaand: { backgroundColor: farge.aksentMyk, borderRadius: radius.lg, padding: 14, gap: 6 },
  forhaandTekst: { fontSize: 15, lineHeight: 22, color: farge.tekst },
  bunn: { paddingHorizontal: marg, paddingTop: 10, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kantSterk },
});
