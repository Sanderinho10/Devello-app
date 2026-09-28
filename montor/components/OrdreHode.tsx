import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Knapp, UtboksMerke } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, radius, skrift, tabellTall, trykk } from "@/lib/tema";
import type { OrderStatus } from "@/lib/typer";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const STATUS_TEKST: Record<OrderStatus, string> = {
  opna: "Åpen",
  paagaar: "Pågår",
  ferdig: "Ferdig",
  fakturert: "Fakturert",
  avbrutt: "Avbrutt",
};

/**
 * Nummer, tittel, kunde, telefon (ring), adresse (kart) og status-knappen.
 * Bare «Start jobben» og «Merk som ferdig» — aldri avbryt eller åpne igjen.
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
    Linking.openURL(Platform.OS === "ios" ? `maps:?q=${q}` : `geo:0,0?q=${q}`);
  };

  const settStatus = async (status: "paagaar" | "ferdig") => {
    await leggTil({ ordre_id: id, type: "status", payload: { status } });
    kjoer();
  };

  const merkFerdig = () => {
    Alert.alert("Merk ordren som ferdig?", "Kontoret får beskjed.", [
      { text: "Avbryt", style: "cancel" },
      { text: "Merk som ferdig", onPress: () => settStatus("ferdig") },
    ]);
  };

  const kanStarte = sammenslaatt.lovlege_overgangar.includes("paagaar");
  const kanFerdig = sammenslaatt.lovlege_overgangar.includes("ferdig");

  return (
    <View style={s.wrap}>
      <OfflineBanner />
      {error && !data ? <Banner tekst={feilTekst(error)} handling="Prøv igjen" onHandling={() => refetch()} /> : null}
      {ordre ? (
        <>
          <View style={s.rad}>
            <Text style={s.nr}>#{ordre.order_no}</Text>
            <View style={s.status}>
              <Text style={s.statusTekst}>{STATUS_TEKST[ordre.status]}</Text>
            </View>
            <UtboksMerke rad={sammenslaatt.ventendeStatus ?? undefined} />
          </View>
          <Text style={s.tittel}>{ordre.title}</Text>
          <Text style={s.kunde}>{ordre.customer_name}</Text>
          <View style={s.knapper}>
            {ordre.customer_phone ? (
              <Pressable accessibilityRole="button" onPress={ring} style={({ pressed }) => [s.lenke, pressed && s.trykket]}>
                <Text style={s.lenkeTekst} numberOfLines={1}>
                  Ring {ordre.customer_phone}
                </Text>
              </Pressable>
            ) : null}
            {ordre.site_address ? (
              <Pressable accessibilityRole="button" onPress={kart} style={({ pressed }) => [s.lenke, pressed && s.trykket]}>
                <Text style={s.lenkeTekst} numberOfLines={2}>
                  {ordre.site_address}
                </Text>
                <Text style={s.lenkeUnder}>Åpne i kart</Text>
              </Pressable>
            ) : null}
          </View>
          {kanStarte ? <Knapp tekst="Start jobben" onPress={() => settStatus("paagaar")} /> : null}
          {kanFerdig ? <Knapp tekst="Merk som ferdig" variant="sekundaer" onPress={merkFerdig} /> : null}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8, paddingTop: 4 },
  rad: { flexDirection: "row", alignItems: "center", gap: 8 },
  nr: { fontSize: skrift.stor, fontWeight: "700", color: farge.tekstSekundaer, ...tabellTall },
  status: { backgroundColor: farge.aksentMyk, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  statusTekst: { fontSize: skrift.liten, fontWeight: "600", color: farge.aksent },
  tittel: { fontSize: skrift.tittel, fontWeight: "700", color: farge.tekst },
  kunde: { fontSize: skrift.normal, color: farge.tekstSekundaer },
  knapper: { flexDirection: "row", gap: 8 },
  lenke: {
    flex: 1,
    minHeight: trykk.minste,
    justifyContent: "center",
    backgroundColor: farge.flate,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: farge.kant,
  },
  trykket: { backgroundColor: farge.aksentMyk },
  lenkeTekst: { fontSize: skrift.normal, fontWeight: "600", color: farge.aksent },
  lenkeUnder: { fontSize: skrift.liten, color: farge.tekstSekundaer },
});
