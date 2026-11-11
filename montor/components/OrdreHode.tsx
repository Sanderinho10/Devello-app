import { Alert, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Knapp, StatusPille, UtboksMerke } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { kvitter } from "@/lib/kvittering";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { skrift, tabellTall } from "@/lib/tema";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

/**
 * Hva, hvem og hvor — og knappene montøren trenger med én hånd: ring, kart
 * og neste steg på jobben. Bare «Start jobben» og «Merk som ferdig»; avbryt
 * og åpne igjen gjøres på kontoret.
 */
export function OrdreHode({ id }: { id: string }) {
  const { sammenslaatt, error, data, refetch } = useOrdreMedUtboks(id);
  const ordre = sammenslaatt.ordre;

  const ring = () => {
    if (ordre?.customer_phone) Linking.openURL(`tel:${ordre.customer_phone.replace(/\s/g, "")}`);
  };

  const kart = () => {
    if (!ordre?.site_address) return;
    const q = encodeURIComponent(ordre.site_address);
    Linking.openURL(Platform.OS === "ios" ? `maps:?q=${q}` : Platform.OS === "android" ? `geo:0,0?q=${q}` : `https://maps.apple.com/?q=${q}`);
  };

  const settStatus = async (status: "paagaar" | "ferdig") => {
    await leggTil({ ordre_id: id, type: "status", payload: { status } });
    kvitter(status === "ferdig" ? "Merket som ferdig" : "Jobben er startet");
    kjoer();
  };

  const merkFerdig = () => {
    Alert.alert("Merk ordren som ferdig?", "Kontoret får beskjed.", [
      { text: "Avbryt", style: "cancel" },
      { text: "Merk som ferdig", onPress: () => settStatus("ferdig") },
    ]);
  };

  const kanStarte = sammenslaatt.lovlege_overgangar.includes("paagaar") && ordre?.status === "opna";
  const kanFerdig = sammenslaatt.lovlege_overgangar.includes("ferdig");

  return (
    <View style={s.wrap}>
      <OfflineBanner />
      {error && !data ? <Banner tekst={feilTekst(error)} handling="Prøv igjen" onHandling={() => refetch()} /> : null}
      {ordre ? (
        <>
          <View style={s.rad}>
            <StatusPille status={ordre.status} />
            <UtboksMerke rad={sammenslaatt.ventendeStatus ?? undefined} />
            <Text style={[skrift.under, tabellTall, s.nr]} numberOfLines={1}>
              #{ordre.order_no} · {ordre.customer_name}
            </Text>
          </View>
          <Text style={skrift.tittel}>{ordre.title}</Text>
          {ordre.site_address ? <Text style={skrift.under}>{ordre.site_address}</Text> : null}
          <View style={s.knapper}>
            {ordre.customer_phone ? <Knapp tekst="Ring" ikon="call" variant="sekundaer" onPress={ring} style={s.knapp} /> : null}
            {ordre.site_address ? <Knapp tekst="Kart" ikon="navigate" variant="sekundaer" onPress={kart} style={s.knapp} /> : null}
          </View>
          {kanStarte ? <Knapp tekst="Start jobben" ikon="play" variant="tonet" onPress={() => settStatus("paagaar")} /> : null}
          {kanFerdig ? <Knapp tekst="Merk som ferdig" ikon="checkmark" variant="tonet" onPress={merkFerdig} /> : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 6 },
  rad: { flexDirection: "row", alignItems: "center", gap: 8 },
  nr: { flex: 1 },
  knapper: { flexDirection: "row", gap: 8, marginTop: 8 },
  knapp: { flex: 1 },
});
