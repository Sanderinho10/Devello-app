import { useRef, useState, type ComponentRef } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Felt, Knapp } from "@/components/ui";
import { advarsel } from "@/lib/haptikk";
import { manglerKonfig, supabase } from "@/lib/supabase";
import { farge, marg, skrift } from "@/lib/tema";

/**
 * E-post og passord — samme konto som nettappen. Passord settes i
 * nettappen. Root-layouten skjuler siden så snart sesjonen finnes, og viser
 * (app) i stedet.
 */
export default function LoggInn() {
  const inn = useSafeAreaInsets();
  const [epost, setEpost] = useState("");
  const [passord, setPassord] = useState("");
  const [feil, setFeil] = useState<string | null>(null);
  const [laster, setLaster] = useState(false);
  const passordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const loggInn = async () => {
    setFeil(null);
    if (!epost.trim() || !passord) {
      setFeil("Skriv inn e-post og passord.");
      return;
    }
    setLaster(true);
    const { error } = await supabase.auth.signInWithPassword({ email: epost.trim(), password: passord });
    setLaster(false);
    if (error) {
      advarsel();
      setFeil(
        /invalid login credentials/i.test(error.message)
          ? "Feil e-post eller passord."
          : /network|fetch/i.test(error.message)
            ? "Ingen dekning — prøv igjen når du har nett."
            : error.message,
      );
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.fyll}>
      <ScrollView contentContainerStyle={[s.innhold, { paddingTop: inn.top + 72, paddingBottom: inn.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.merke}>
          <View style={s.ikon}>
            <Image source={require("../assets/merke.png")} style={s.ikonBilde} />
          </View>
          <View>
            <Text style={skrift.storTittel}>Devello</Text>
            <Text style={skrift.under}>Montør</Text>
          </View>
        </View>

        {manglerKonfig ? <Banner slag="advarsel" tekst="Appen mangler oppsett (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL)." /> : null}
        {feil ? <Banner tekst={feil} /> : null}

        <Felt
          etikett="E-post"
          value={epost}
          onChangeText={setEpost}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passordRef.current?.focus()}
        />
        <Felt
          ref={passordRef}
          etikett="Passord"
          value={passord}
          onChangeText={setPassord}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={loggInn}
        />
        <Knapp tekst="Logg inn" onPress={loggInn} stor laster={laster} style={s.knapp} />

        <View style={s.glemt}>
          <Text style={skrift.overskrift}>Glemt passord?</Text>
          <Text style={skrift.under}>Passord settes i nettappen (app.devello.no).</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg + 8, gap: 16 },
  merke: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  ikon: { width: 60, height: 60, borderRadius: 14, backgroundColor: farge.flate, borderWidth: StyleSheet.hairlineWidth, borderColor: farge.kant, alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05)" },
  ikonBilde: { width: 60, height: 60 },
  knapp: { marginTop: 4 },
  glemt: { marginTop: 28, gap: 2 },
});
