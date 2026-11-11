import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Felt, Knapp } from "@/components/ui";
import { komprimerOgLagre, slettLokalt, type LagretBilete } from "@/lib/bilete";
import { kvitter } from "@/lib/kvittering";
import { farge, marg, radius, skrift } from "@/lib/tema";
import { leggTil, nyClientId } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const MAKS_BILDER = 5;

/**
 * Tekst + inntil fem bilder. Lagre → ett utboks-element for notatet og ett
 * per bilde (som venter til notatet er sendt). Parameter: ordre.
 */
export default function NyttNotat() {
  const { ordre: ordreId = "" } = useLocalSearchParams<{ ordre: string }>();
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const [tekst, setTekst] = useState("");
  const [bilder, setBilder] = useState<LagretBilete[]>([]);
  const [feil, setFeil] = useState<string | null>(null);
  const [jobber, setJobber] = useState(false);
  const [kameraTillatelse, beOmKamera] = ImagePicker.useCameraPermissions();

  const leggTilBilder = async (resultat: ImagePicker.ImagePickerResult) => {
    if (resultat.canceled) return;
    setJobber(true);
    setFeil(null);
    try {
      const nye: LagretBilete[] = [];
      for (const a of resultat.assets.slice(0, MAKS_BILDER - bilder.length)) {
        nye.push(await komprimerOgLagre(a.uri, a.width, a.height));
      }
      setBilder((b) => [...b, ...nye]);
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke behandle bildet.");
    } finally {
      setJobber(false);
    }
  };

  const taBilde = async () => {
    if (!kameraTillatelse?.granted) {
      const svar = await beOmKamera();
      if (!svar.granted) {
        setFeil("Appen trenger tilgang til kameraet. Slå det på i Innstillinger.");
        return;
      }
    }
    await leggTilBilder(await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 }));
  };

  const velgBilde = async () => {
    await leggTilBilder(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: MAKS_BILDER - bilder.length,
        quality: 0.9,
      }),
    );
  };

  const fjern = (uri: string) => {
    slettLokalt(uri);
    setBilder((b) => b.filter((x) => x.uri !== uri));
  };

  const lagre = async () => {
    const t = tekst.trim();
    if (!t) return setFeil(bilder.length ? "Skriv en linje om hva bildene viser." : "Skriv noe i notatet.");
    if (t.length > 4000) return setFeil("Notatet kan ha høyst 4000 tegn.");
    setJobber(true);
    try {
      const notatId = nyClientId();
      await leggTil({ ordre_id: ordreId, type: "notat", payload: { text: t }, client_id: notatId });
      const tittel = t.slice(0, 40) || "Bilde";
      for (const b of bilder) {
        await leggTil({
          ordre_id: ordreId,
          type: "bilete",
          payload: { title: tittel, file_name: b.filnavn, mime: b.mime, note_id: null },
          fil_sti: b.uri,
          avhengig_av: notatId,
        });
      }
      kjoer();
      router.back();
      kvitter("Notatet er lagret");
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke lagre.");
      setJobber(false);
    }
  };

  const fullt = bilder.length >= MAKS_BILDER;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {feil ? <Banner tekst={feil} /> : null}
        <Felt autoFocus multiline value={tekst} onChangeText={setTekst} placeholder="Skriv notatet her" style={s.tekstfelt} />
        <View style={s.knapper}>
          <Knapp tekst="Ta bilde" ikon="camera-outline" variant="sekundaer" onPress={taBilde} deaktivert={fullt} style={s.halv} />
          <Knapp tekst="Velg bilde" ikon="images-outline" variant="sekundaer" onPress={velgBilde} deaktivert={fullt} style={s.halv} />
        </View>
        {bilder.length ? (
          <View style={s.bilder}>
            {bilder.map((b) => (
              <View key={b.uri} style={s.miniWrap}>
                <Image source={{ uri: b.uri }} style={s.mini} />
                <Pressable accessibilityRole="button" accessibilityLabel="Fjern bildet" onPress={() => fjern(b.uri)} style={s.fjern} hitSlop={10}>
                  <Text style={s.fjernTekst}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={skrift.liten}>{bilder.length ? `${bilder.length} av ${MAKS_BILDER} bilder` : `Inntil ${MAKS_BILDER} bilder. De sendes når du har dekning.`}</Text>
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Lagre" stor onPress={lagre} laster={jobber} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 24, gap: 12 },
  tekstfelt: { minHeight: 150 },
  knapper: { flexDirection: "row", gap: 8 },
  halv: { flex: 1 },
  bilder: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  miniWrap: { width: 96, height: 96 },
  mini: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: farge.fyll },
  fjern: { position: "absolute", top: -8, right: -8, width: 28, height: 28, borderRadius: 14, backgroundColor: farge.tekst, alignItems: "center", justifyContent: "center" },
  fjernTekst: { color: farge.hvit, fontSize: 18, lineHeight: 20, fontWeight: "700" },
  bunn: { paddingHorizontal: marg, paddingTop: 10, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kantSterk },
});
