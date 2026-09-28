import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Felt, Knapp } from "@/components/ui";
import { manglerKonfig, supabase } from "@/lib/supabase";
import { farge, skrift } from "@/lib/tema";

/** E-post og passord — samme konto som nettappen. Passord settes i nettappen. */
export default function LoggInn() {
  const inn = useSafeAreaInsets();
  const [epost, setEpost] = useState("");
  const [passord, setPassord] = useState("");
  const [feil, setFeil] = useState<string | null>(null);
  const [laster, setLaster] = useState(false);

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
      <ScrollView
        contentContainerStyle={[s.innhold, { paddingTop: inn.top + 48, paddingBottom: inn.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.logo}>Devello</Text>
        <Text style={s.under}>Montør</Text>

        {manglerKonfig ? (
          <Banner slag="advarsel" tekst="Appen mangler oppsett (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL)." />
        ) : null}
        {feil ? <Banner tekst={feil} /> : null}

        <Felt
          etikett="E-post"
          value={epost}
          onChangeText={setEpost}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
        />
        <Felt
          etikett="Passord"
          value={passord}
          onChangeText={setPassord}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={loggInn}
        />
        <Knapp tekst="Logg inn" onPress={loggInn} stor laster={laster} />

        <View style={s.glemt}>
          <Text style={s.glemtTittel}>Glemt passord?</Text>
          <Text style={s.glemtTekst}>Passord settes i nettappen (app.devello.no).</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: 20, gap: 16 },
  logo: { fontSize: 36, fontWeight: "800", color: farge.tekst, letterSpacing: -0.5 },
  under: { fontSize: skrift.stor, color: farge.tekstSekundaer, marginTop: -12, marginBottom: 16 },
  glemt: { marginTop: 24, gap: 4 },
  glemtTittel: { fontSize: skrift.normal, fontWeight: "600", color: farge.tekst },
  glemtTekst: { fontSize: skrift.normal, color: farge.tekstSekundaer },
});
