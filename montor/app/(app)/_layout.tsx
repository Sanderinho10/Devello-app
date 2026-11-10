import { useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Knapp, Kvittering, Laster } from "@/components/ui";
import { ApiFeil, feilTekst } from "@/lib/api";
import { lyttPaaPush } from "@/lib/push";
import { useMeg } from "@/lib/sporringar";
import { supabase } from "@/lib/supabase";
import { farge, marg, skrift } from "@/lib/tema";

/**
 * Innlogget del. Fanene (Program · Ordrer · Meg) ligger nederst i en stack,
 * og skjemaene — før timer, legg til materiell, nytt notat — er modaler over
 * hele appen. Da lukker «Avbryt» og «Lagre» alltid tilbake dit man kom fra,
 * uansett hvilken fane det var.
 *
 * Første kall er GET /api/app/meg — 403 betyr at selskapet ikke har
 * ordre-modulen, og da er det bare «Logg ut» igjen.
 */
export default function AppLayout() {
  const meg = useMeg();
  const inn = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  // Push kobles til først når vi vet hvem som er inne og at selskapet har ordre-modulen.
  const klar = !!meg.data;
  useEffect(() => {
    if (!klar) return;
    return lyttPaaPush(qc, (sti) => router.navigate(sti));
  }, [klar, qc, router]);

  if (meg.error instanceof ApiFeil && meg.error.status === 403) {
    return (
      <View style={[s.senter, { paddingTop: inn.top + 48, paddingBottom: inn.bottom + 24 }]}>
        <Text style={skrift.tittel}>Ordre-modulen er ikke aktivert</Text>
        <Text style={skrift.under}>{meg.error.melding}</Text>
        <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={() => supabase.auth.signOut()} />
      </View>
    );
  }

  if (!meg.data) {
    return (
      <View style={[s.senter, { paddingTop: inn.top + 48, paddingBottom: inn.bottom + 24 }]}>
        {meg.error ? (
          <>
            <Banner tekst={feilTekst(meg.error)} slag={meg.error instanceof ApiFeil ? "feil" : "advarsel"} handling="Prøv igjen" onHandling={() => meg.refetch()} />
            <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={() => supabase.auth.signOut()} />
          </>
        ) : (
          <Laster />
        )}
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: farge.bakgrunn },
          headerShadowVisible: false,
          headerTintColor: farge.aksent,
          headerTitleStyle: { color: farge.tekst, fontWeight: "600" },
          contentStyle: { backgroundColor: farge.bakgrunn },
          headerLeft: () => <Avbryt />,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ny-time" options={{ presentation: "modal", title: "Før timer" }} />
        <Stack.Screen name="ny-materiell" options={{ presentation: "modal", title: "Legg til materiell" }} />
        <Stack.Screen name="nytt-notat" options={{ presentation: "modal", title: "Nytt notat" }} />
        <Stack.Screen name="varsler" options={{ presentation: "modal", title: "Varsler", headerLeft: () => <Avbryt tekst="Lukk" /> }} />
        <Stack.Screen
          name="bilete"
          options={{
            presentation: "fullScreenModal",
            title: "Bilde",
            headerStyle: { backgroundColor: "#000" },
            headerTitleStyle: { color: "#fff" },
            contentStyle: { backgroundColor: "#000" },
            headerLeft: () => <Avbryt tekst="Lukk" lys />,
          }}
        />
      </Stack>
      <Kvittering />
    </>
  );
}

/** «Avbryt» oppe til venstre i en modal — alltid tilbake dit man kom fra. */
function Avbryt({ tekst = "Avbryt", lys }: { tekst?: string; lys?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tekst}
      hitSlop={16}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={s.avbryt}
    >
      <Text style={[s.avbrytTekst, lys && { color: farge.hvit }]}>{tekst}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  senter: { flex: 1, backgroundColor: farge.bakgrunn, paddingHorizontal: marg + 4, gap: 16, justifyContent: "center" },
  // iOS og Android gir headerLeft marg selv; nettleseren gjør det ikke.
  avbryt: { minHeight: 36, justifyContent: "center", paddingRight: 12, marginLeft: Platform.OS === "web" ? 16 : 0 },
  avbrytTekst: { fontSize: 17, color: farge.aksent, letterSpacing: -0.2 },
});
