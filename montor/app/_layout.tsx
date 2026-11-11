import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import NetInfo from "@react-native-community/netinfo";
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SesjonProvider, useSesjon } from "@/lib/sesjon";
import { farge } from "@/lib/tema";
import { settBruker } from "@/lib/utboks/db";
import { settQueryClient, startMotor } from "@/lib/utboks/motor";

/**
 * Root: react-query med persister (ordreliste og ordre vises offline),
 * Supabase-sesjon, og utboks-motoren. Innlogget → (app), der «/» er
 * programmet. Ellers /logg-inn. Guardene bytter selv når sesjonen kommer
 * eller går.
 */

const SJU_DAGAR = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: SJU_DAGAR,
      // Vis det som er hentet sist også uten dekning; ikke heng i «paused».
      networkMode: "offlineFirst",
      retry: 1,
    },
  },
});
settQueryClient(queryClient);

// react-query vet ikke selv når en app kommer i forgrunnen eller får nett
// igjen. Med disse to hentes det som er utdatert på nytt når montøren tar
// opp telefonen, og når dekningen er tilbake.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (tilstand) => focusManager.setFocused(tilstand === "active"));
}
onlineManager.setEventListener((settPaa) => NetInfo.addEventListener((s) => settPaa(s.isConnected !== false)));

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "devello-montor-cache", throttleTime: 1000 });

// Hold splashen til sesjonen er lest, så innloggingen ikke blinker forbi
// for en som alt er innlogget. Aldri lenger enn to sekunder.
/** Hvem som sist var inne i denne app-økta. undefined = ingen ennå (kald start beholder lagret data). */
let sisteBruker: string | null | undefined;

SplashScreen.preventAutoHideAsync().catch(() => {});
setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 2000);

export default function RotLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: SJU_DAGAR, buster: "v1" }}>
        <SesjonProvider>
          <StatusBar style="dark" />
          <Navigasjon />
        </SesjonProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigasjon() {
  const { sesjon, klar } = useSesjon();

  useEffect(() => {
    if (klar) SplashScreen.hideAsync().catch(() => {});
  }, [klar]);

  // Ny bruker (eller ingen): det som lå i minnet tilhørte den forrige. Tøm
  // det, pek utboksen på riktig eier, og start motoren for den som er inne.
  const brukerId = sesjon?.user.id ?? null;
  useEffect(() => {
    if (!klar) return; // lagret sesjon er ikke lest ennå — vi vet ikke hvem som er inne
    let stopp: (() => void) | undefined;
    let avbrutt = false;
    if (sisteBruker !== brukerId) {
      if (sisteBruker !== undefined) queryClient.clear();
      sisteBruker = brukerId;
    }
    settBruker(brukerId).then(() => {
      if (!avbrutt && brukerId) stopp = startMotor();
    });
    return () => {
      avbrutt = true;
      stopp?.();
    };
  }, [klar, brukerId]);

  if (!klar) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: farge.bakgrunn } }}>
      <Stack.Protected guard={!!sesjon}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!sesjon}>
        <Stack.Screen name="logg-inn" />
      </Stack.Protected>
    </Stack>
  );
}
