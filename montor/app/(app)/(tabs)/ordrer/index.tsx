import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Gruppe, Laster, Rad, Segment, Skjermhode, Sokefelt, StatusPille, Tom } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { timer } from "@/lib/format";
import { useMeg, useOrdrar } from "@/lib/sporringar";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import type { OrdreIListe } from "@/lib/typer";

type Fane = "paagaar" | "opna" | "ferdig";

/** Ordrelista. Stor tittel, søk, segment og en tett liste — pull for å hente på nytt. */
export default function Ordreliste() {
  const router = useRouter();
  const ordrar = useOrdrar();
  const meg = useMeg().data;
  const [sok, setSok] = useState("");
  const [valgtFane, setValgtFane] = useState<Fane | null>(null);

  const alle = useMemo(() => ordrar.data ?? [], [ordrar.data]);
  const tal = (st: Fane) => alle.filter((o) => o.status === st).length;
  // Standard Pågår; er den tom, vis Åpne.
  const fane: Fane = valgtFane ?? (tal("paagaar") > 0 || !alle.length ? "paagaar" : "opna");

  const liste = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return alle.filter((o) => {
      // Et søk leter i alle fanene — montøren vet ikke alltid hvor ordren står.
      if (!q) return o.status === fane;
      return String(o.order_no).startsWith(q.replace(/^#/, "")) || o.title.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
    });
  }, [alle, fane, sok]);

  return (
    <View style={s.fyll}>
      <Skjermhode tittel="Ordrer" over={meg?.company.name}>
        <Sokefelt placeholder="Søk på nummer, kunde eller tittel" value={sok} onChangeText={setSok} />
        {sok.trim() ? null : (
          <Segment
            valg={[
              { verdi: "paagaar", tekst: `Pågår${tal("paagaar") ? ` ${tal("paagaar")}` : ""}` },
              { verdi: "opna", tekst: `Åpne${tal("opna") ? ` ${tal("opna")}` : ""}` },
              { verdi: "ferdig", tekst: `Ferdige${tal("ferdig") ? ` ${tal("ferdig")}` : ""}` },
            ]}
            verdi={fane}
            onChange={setValgtFane}
          />
        )}
      </Skjermhode>
      {ordrar.isPending && !ordrar.data ? (
        <Laster />
      ) : (
        <FlatList
          data={liste.length ? [liste] : []}
          keyExtractor={() => "ordrar"}
          contentContainerStyle={s.liste}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={ordrar.isRefetching} onRefresh={() => void ordrar.refetch()} tintColor={farge.tekstTertiaer} />}
          ListHeaderComponent={
            <View style={s.bannere}>
              <OfflineBanner />
              {ordrar.error && !ordrar.data ? <Banner tekst={feilTekst(ordrar.error)} handling="Prøv igjen" onHandling={() => ordrar.refetch()} /> : null}
            </View>
          }
          ListEmptyComponent={
            sok.trim() ? (
              <Tom ikon="search-outline" tekst="Ingen ordrer passer søket" />
            ) : (
              <Tom ikon="briefcase-outline" tekst={fane === "paagaar" ? "Ingen ordrer pågår" : fane === "opna" ? "Ingen åpne ordrer" : "Ingen ferdige ordrer"} />
            )
          }
          renderItem={({ item }) => (
            <Gruppe>
              {item.map((o) => (
                <OrdreRad key={o.id} ordre={o} visStatus={!!sok.trim()} onPress={() => router.push(`/ordrer/${o.id}/timer`)} />
              ))}
            </Gruppe>
          )}
        />
      )}
    </View>
  );
}

function OrdreRad({ ordre, visStatus, onPress }: { ordre: OrdreIListe; visStatus: boolean; onPress: () => void }) {
  // I et søk står ordrer fra alle fanene sammen — da sier pillen hvor ordren står.
  const hoyre = visStatus ? <StatusPille status={ordre.status} /> : ordre.mine_timar > 0 ? <Text style={s.timer}>{timer(ordre.mine_timar)}</Text> : undefined;
  return (
    <Rad onPress={onPress} pil hoyre={hoyre}>
      <Text style={skrift.overskrift} numberOfLines={2}>
        {ordre.title}
      </Text>
      <Text style={[skrift.under, tabellTall]} numberOfLines={1}>
        #{ordre.order_no} · {ordre.customer_name}
      </Text>
      {ordre.site_address ? (
        <Text style={skrift.liten} numberOfLines={1}>
          {ordre.site_address}
        </Text>
      ) : null}
    </Rad>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  liste: { paddingHorizontal: marg, paddingTop: 6, paddingBottom: 32 },
  bannere: { gap: 10, marginBottom: 4 },
  timer: { fontSize: 15, fontWeight: "500", color: farge.tekstSekundaer, ...tabellTall },
});
