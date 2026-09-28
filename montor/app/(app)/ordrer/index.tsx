import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Felt, Kort, Laster, Segment, Tom } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { timer } from "@/lib/format";
import { useOrdrar } from "@/lib/sporringar";
import { farge, skrift, tabellTall } from "@/lib/tema";
import type { OrderStatus, OrdreIListe } from "@/lib/typer";

type Fane = "paagaar" | "opna" | "ferdig";

const FANER: { verdi: Fane; tekst: string }[] = [
  { verdi: "paagaar", tekst: "Pågår" },
  { verdi: "opna", tekst: "Åpne" },
  { verdi: "ferdig", tekst: "Ferdige" },
];

/** Ordrelista. Segment øverst, lokalt søk, pull-to-refresh, offline-banner. */
export default function Ordreliste() {
  const router = useRouter();
  const ordrar = useOrdrar();
  const [sok, setSok] = useState("");
  const [valgtFane, setValgtFane] = useState<Fane | null>(null);

  const alle = useMemo(() => ordrar.data ?? [], [ordrar.data]);
  // Standard Pågår; er den tom, vis Åpne.
  const fane: Fane = valgtFane ?? (alle.some((o) => o.status === "paagaar") || !alle.length ? "paagaar" : "opna");

  const liste = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return alle.filter((o) => {
      if (o.status !== fane) return false;
      if (!q) return true;
      return String(o.order_no).startsWith(q) || o.title.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
    });
  }, [alle, fane, sok]);

  return (
    <View style={s.fyll}>
      <View style={s.topp}>
        <Segment valg={FANER} verdi={fane} onChange={setValgtFane} />
        <Felt placeholder="Søk på nummer, kunde eller tittel" value={sok} onChangeText={setSok} autoCorrect={false} clearButtonMode="while-editing" />
        <OfflineBanner />
        {ordrar.error && !ordrar.data ? <Banner tekst={feilTekst(ordrar.error)} handling="Prøv igjen" onHandling={() => ordrar.refetch()} /> : null}
      </View>
      {ordrar.isPending && !ordrar.data ? (
        <Laster />
      ) : (
        <FlatList
          data={liste}
          keyExtractor={(o) => o.id}
          contentContainerStyle={s.liste}
          refreshControl={<RefreshControl refreshing={ordrar.isRefetching} onRefresh={() => ordrar.refetch()} tintColor={farge.aksent} />}
          ListEmptyComponent={<Tom tekst={sok ? "Ingen ordrer passer søket." : "Ingen ordrer her."} />}
          renderItem={({ item }) => <OrdreRad ordre={item} onPress={() => router.push(`/ordrer/${item.id}/timer`)} />}
        />
      )}
    </View>
  );
}

function OrdreRad({ ordre, onPress }: { ordre: OrdreIListe; onPress: () => void }) {
  return (
    <Kort onPress={onPress}>
      <Text style={s.nr}>
        #{ordre.order_no} · {ordre.customer_name}
      </Text>
      <Text style={s.tittel} numberOfLines={2}>
        {ordre.title}
      </Text>
      {ordre.site_address ? (
        <Text style={s.adresse} numberOfLines={1}>
          {ordre.site_address}
        </Text>
      ) : null}
      <Text style={s.timer}>Mine timer: {timer(ordre.mine_timar)}</Text>
    </Kort>
  );
}

export const STATUS_TEKST: Record<OrderStatus, string> = {
  opna: "Åpen",
  paagaar: "Pågår",
  ferdig: "Ferdig",
  fakturert: "Fakturert",
  avbrutt: "Avbrutt",
};

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  topp: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  liste: { padding: 16, gap: 10, paddingBottom: 32 },
  nr: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer, ...tabellTall },
  tittel: { fontSize: skrift.stor, fontWeight: "600", color: farge.tekst, marginTop: 2 },
  adresse: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 2 },
  timer: { fontSize: skrift.normal, color: farge.tekst, marginTop: 8, ...tabellTall },
});
