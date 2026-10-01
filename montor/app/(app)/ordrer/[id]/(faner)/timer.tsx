import { useRouter } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { BUNN_PLASS, FaneBunn } from "@/components/FaneBunn";
import { Banner, Knapp, Kort, Laster, Sheet, Tom, UtboksMerke } from "@/components/ui";
import { api, feilTekst } from "@/lib/api";
import { dato, timer as fmtTimer } from "@/lib/format";
import { useInvaliderOrdre, useMeg, useOrdreMedUtboks, type TimeRad } from "@/lib/sporringar";
import { farge, skrift, tabellTall } from "@/lib/tema";
import { slett as slettUtboks } from "@/lib/utboks/db";

/** Timer på ordren, nyeste først. Egne kan slettes med langt trykk. */
export default function TimerFane() {
  const id = useOrdreId();
  const router = useRouter();
  const meg = useMeg().data;
  const { sammenslaatt, isPending, isRefetching, refetch, data } = useOrdreMedUtboks(id);
  const invalider = useInvaliderOrdre();
  const [valgt, setValgt] = useState<TimeRad | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const [sletter, setSletter] = useState(false);

  const slett = async () => {
    if (!valgt) return;
    setSletter(true);
    setFeil(null);
    try {
      if (valgt._utboks) {
        await slettUtboks(valgt._utboks.id);
      } else {
        await api(`/api/orders/${id}/timer/${valgt.id}`, { method: "DELETE" });
        invalider(id);
      }
      setValgt(null);
    } catch (e) {
      setFeil(feilTekst(e));
    } finally {
      setSletter(false);
    }
  };

  return (
    <View style={s.fyll}>
      {feil ? (
        <View style={s.banner}>
          <Banner tekst={feil} />
        </View>
      ) : null}
      {isPending && !data ? (
        <Laster />
      ) : (
        <FlatList
          data={sammenslaatt.timer}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.liste}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={farge.aksent} />}
          ListEmptyComponent={<Tom tekst="Ingen timer ført ennå." />}
          ListFooterComponent={<View style={{ height: BUNN_PLASS }} />}
          renderItem={({ item }) => {
            const egen = !!meg && item.user_id === meg.user.id;
            return (
              <Kort onLongPress={egen ? () => setValgt(item) : undefined}>
                <View style={s.rad}>
                  <Text style={s.navn}>{item.user_name}</Text>
                  <Text style={s.dato}>{dato(item.work_date)}</Text>
                </View>
                <View style={s.rad}>
                  <Text style={s.type}>{item.time_type_name}</Text>
                  <Text style={s.timer}>{fmtTimer(item.hours)}</Text>
                </View>
                {item.note ? <Text style={s.notat}>{item.note}</Text> : null}
                <UtboksMerke rad={item._utboks} />
              </Kort>
            );
          }}
        />
      )}
      <FaneBunn tekst="+ Før timer" onPress={() => router.push(`/ordrer/${id}/ny-time`)} />

      <Sheet synlig={!!valgt} onLukk={() => setValgt(null)} tittel={valgt ? `${fmtTimer(valgt.hours)} ${valgt.time_type_name}, ${dato(valgt.work_date)}` : ""}>
        <Knapp tekst="Slett timeføringen" variant="fare" stor onPress={slett} laster={sletter} />
        <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setValgt(null)} />
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingTop: 8 },
  liste: { padding: 16, gap: 10 },
  rad: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  navn: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer },
  dato: { fontSize: skrift.liten, color: farge.tekstSekundaer },
  type: { fontSize: skrift.stor, fontWeight: "600", color: farge.tekst, flex: 1 },
  timer: { fontSize: skrift.stor, fontWeight: "700", color: farge.tekst, ...tabellTall },
  notat: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 4 },
});
