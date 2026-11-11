import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Ikon, Knapp } from "@/components/ui";
import { kvitter } from "@/lib/kvittering";
import { slaaPaaPush, usePushStatus } from "@/lib/push";
import { farge, radius, skrift, skygge } from "@/lib/tema";

/**
 * Kortet som ber montøren slå på varsler. Systemets spørsmål kommer først
 * når han trykker — aldri av seg selv ved oppstart.
 *
 * Uten «alle» vises kortet bare før montøren er spurt (programmet). Med
 * «alle» sier det også fra når varsler er slått av eller ikke kan brukes
 * (varsel-lista).
 */
export function PushKort({ alle }: { alle?: boolean }) {
  const status = usePushStatus();
  const [jobber, setJobber] = useState(false);

  if (status === "paa") return null;
  if (!alle && status !== "ikke_spurt") return null;

  const slaaPaa = async () => {
    setJobber(true);
    const ny = await slaaPaaPush();
    setJobber(false);
    if (ny === "paa") kvitter("Varsler er slått på");
  };

  if (status === "utilgjengelig") {
    return (
      <View style={s.kort}>
        <Tekst ikon="notifications-off-outline" tittel="Push virker ikke her" tekst="Denne utgaven av appen kan ikke få varsler på låseskjermen. Varslene vises i lista under, og kommer på e-post." />
      </View>
    );
  }

  if (status === "avslaatt") {
    return (
      <View style={s.kort}>
        <Tekst ikon="notifications-off-outline" tittel="Varsler er slått av" tekst="Slå dem på i Innstillinger for å få beskjed når du blir satt opp på et oppdrag." />
        <Knapp tekst="Åpne Innstillinger" variant="sekundaer" onPress={() => Linking.openSettings()} />
      </View>
    );
  }

  return (
    <View style={s.kort}>
      <Tekst ikon="notifications-outline" tittel="Få beskjed om nye oppdrag" tekst="Telefonen varsler når kontoret setter deg opp på et oppdrag, flytter det eller tar deg av det." />
      <Knapp tekst="Slå på varsler" variant="tonet" onPress={slaaPaa} laster={jobber} />
    </View>
  );
}

function Tekst({ ikon, tittel, tekst }: { ikon: "notifications-outline" | "notifications-off-outline"; tittel: string; tekst: string }) {
  return (
    <View style={s.rad}>
      <View style={s.ikon}>
        <Ikon navn={ikon} storleik={22} farge={farge.aksent} />
      </View>
      <View style={s.tekst}>
        <Text style={skrift.overskrift}>{tittel}</Text>
        <Text style={skrift.under}>{tekst}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  kort: { backgroundColor: farge.flate, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: farge.kant, padding: 16, gap: 12, ...skygge },
  rad: { flexDirection: "row", gap: 12 },
  ikon: { width: 40, height: 40, borderRadius: 20, backgroundColor: farge.aksentMyk, alignItems: "center", justifyContent: "center" },
  tekst: { flex: 1, gap: 2 },
});
