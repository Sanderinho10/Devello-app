import { useNetInfo } from "@react-native-community/netinfo";
import { Banner } from "@/components/ui";

/** «Ingen dekning — viser sist hentet» når telefonen ikke har nett. */
export function OfflineBanner() {
  const nett = useNetInfo();
  if (nett.isConnected !== false) return null;
  return <Banner slag="advarsel" tekst="Ingen dekning — viser sist hentet" />;
}

export function useErOffline(): boolean {
  return useNetInfo().isConnected === false;
}
