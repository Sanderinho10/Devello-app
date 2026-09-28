import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SesjonProvider, useSesjon } from "@/lib/sesjon";
import { farge } from "@/lib/tema";
import { settQueryClient, startMotor } from "@/lib/utboks/motor";

/**
 * Root: react-query med persister (ordreliste og ordre vises offline),
 * Supabase-sesjon, og utboks-motoren. Innlogget → (app), ellers innlogging.
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

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: "devello-montor-cache", throttleTime: 1000 });

SplashScreen.preventAutoHideAsync().catch(() => {});

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

  useEffect(() => {
    if (!sesjon) return;
    return startMotor();
  }, [sesjon]);

  if (!klar) return null;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: farge.bakgrunn } }}>
      <Stack.Protected guard={!!sesjon}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!sesjon}>
        <Stack.Screen name="(auth)/logg-inn" />
      </Stack.Protected>
    </Stack>
  );
}
