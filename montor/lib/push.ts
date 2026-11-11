import "./pushStille";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { kall } from "./api";
import { lesPushData, varselMaal } from "./varselMaal";

/**
 * Push-varsler. Når kontoret setter montøren på et oppdrag, flytter det
 * eller tar ham av det, sender serveren push til Expo-tokenet appen har
 * registrert. Uten token går varselet på e-post i stedet — og lista i
 * appen viser alle varsler uansett.
 *
 * Appen spør aldri om lov ved oppstart: montøren slår på varsler selv
 * («Slå på varsler»), og først da kommer systemets spørsmål.
 *
 * push.web.ts er nettleserutgaven (ingen push), bare til forhåndsvisning.
 */

export type PushStatus =
  /** Lov gitt og tokenet er registrert på serveren. */
  | "paa"
  /** Montøren er ikke spurt ennå. */
  | "ikke_spurt"
  /** Sagt nei, eller slått av i Innstillinger. */
  | "avslaatt"
  /** Denne utgaven av appen kan ikke få push (simulator, Expo Go på Android). */
  | "utilgjengelig";

const TOKEN_NOKKEL = "push-token";

let status: PushStatus = "ikke_spurt";
const lyttere = new Set<() => void>();

function sett(ny: PushStatus) {
  if (ny === status) return;
  status = ny;
  for (const l of lyttere) l();
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(
    (l) => {
      lyttere.add(l);
      return () => {
        lyttere.delete(l);
      };
    },
    () => status,
    () => status,
  );
}

// Vis varselet også når appen er åpen — montøren står kanskje på en annen skjerm.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Henter tokenet og melder det til serveren. Kalles bare når lov er gitt. */
async function registrerToken(): Promise<PushStatus> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Oppdrag",
        description: "Når du blir satt opp på et oppdrag, eller et oppdrag endres.",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return "utilgjengelig";
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await AsyncStorage.setItem(TOKEN_NOKKEL, token);
    // Idempotent på serveren. Når vi ikke fram (ingen dekning), prøver neste
    // oppstart og neste gang appen kommer i forgrunnen igjen.
    await kall("/api/app/push-token", { method: "POST", body: { token, platform: Platform.OS } }).catch(() => {});
    return "paa";
  } catch {
    // Simulator uten push, eller Expo Go på Android.
    return "utilgjengelig";
  }
}

/**
 * Ved oppstart og når appen kommer i forgrunnen: les hva montøren har
 * bestemt, og registrer tokenet på nytt når lov er gitt. Spør aldri.
 */
export async function oppdaterPush(): Promise<void> {
  try {
    const lov = await Notifications.getPermissionsAsync();
    if (lov.granted) sett(await registrerToken());
    else sett(lov.canAskAgain && lov.status === "undetermined" ? "ikke_spurt" : "avslaatt");
  } catch {
    sett("utilgjengelig");
  }
}

/** Montøren trykket «Slå på varsler»: nå kommer systemets spørsmål. */
export async function slaaPaaPush(): Promise<PushStatus> {
  try {
    const lov = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    sett(lov.granted ? await registrerToken() : "avslaatt");
  } catch {
    sett("utilgjengelig");
  }
  return status;
}

/**
 * Før utlogging: ta tokenet av brukeren, ellers får telefonen varslene til
 * den som logget ut. Venter høyst tre sekunder — utlogging skal ikke henge.
 */
export async function avregistrerPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_NOKKEL);
    if (!token) return;
    await Promise.race([kall("/api/app/push-token", { method: "DELETE", body: { token } }), new Promise((r) => setTimeout(r, 3000))]);
    await AsyncStorage.removeItem(TOKEN_NOKKEL);
  } catch {
    // Ingen dekning: neste innlogging på telefonen flytter tokenet uansett.
  }
}

/** Tallet på app-ikonet følger antall uleste. */
export function settMerke(ulest: number) {
  Notifications.setBadgeCountAsync(ulest).catch(() => {});
}

/**
 * Kobler varslene til appen: et varsel som kommer inn henter program,
 * ordrer og varsel-lista på nytt; et trykk på varselet åpner ordren eller
 * programmet. Returnerer en opprydder.
 */
export function lyttPaaPush(qc: QueryClient, gaaTil: (sti: string) => void): () => void {
  const friskOpp = () => {
    for (const nokkel of ["varsel", "kalender", "ordrar", "timeforslag"]) qc.invalidateQueries({ queryKey: [nokkel] });
  };
  const aapne = (svar: Notifications.NotificationResponse | null) => {
    if (!svar) return;
    const data = lesPushData(svar.notification.request.content.data);
    if (data.order_id) qc.invalidateQueries({ queryKey: ["ordre", data.order_id] });
    friskOpp();
    gaaTil(varselMaal(data));
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  };

  // Appen ble åpnet ved et trykk på et varsel.
  Notifications.getLastNotificationResponseAsync().then(aapne).catch(() => {});
  const mottatt = Notifications.addNotificationReceivedListener(friskOpp);
  const trykket = Notifications.addNotificationResponseReceivedListener(aapne);
  // Montøren kan ha slått varsler av eller på i Innstillinger mens appen lå i bakgrunnen.
  const app = AppState.addEventListener("change", (tilstand) => {
    if (tilstand === "active") oppdaterPush();
  });
  oppdaterPush();

  return () => {
    mottatt.remove();
    trykket.remove();
    app.remove();
  };
}
