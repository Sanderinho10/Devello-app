import { useRouter } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { BUNN_PLASS, FaneBunn } from "@/components/FaneBunn";
import { Banner, Knapp, Kort, Laster, Merke, Sheet, Tom, UtboksMerke } from "@/components/ui";
import { api, feilTekst } from "@/lib/api";
import { mengde } from "@/lib/format";
import { useInvaliderOrdre, useMeg, useOrdreMedUtboks, type MateriellRad } from "@/lib/sporringar";
import { farge, skrift, tabellTall } from "@/lib/tema";
import { slett as slettUtboks } from "@/lib/utboks/db";

/** Materiell på ordren. Linjer fra faktura er låst; egne manuelle kan slettes med langt trykk. */
export default function MateriellFane() {
  const id = useOrdreId();
  const router = useRouter();
  const meg = useMeg().data;
  const { sammenslaatt, isPending, isRefetching, refetch, data } = useOrdreMedUtboks(id);
  const invalider = useInvaliderOrdre();
  const [valgt, setValgt] = useState<MateriellRad | null>(null);
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
        await api(`/api/orders/${id}/materiell/${valgt.id}`, { method: "DELETE" });
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
          data={sammenslaatt.materiell}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.liste}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={farge.aksent} />}
          ListEmptyComponent={<Tom tekst="Ingen materiell ført ennå." />}
          ListFooterComponent={<View style={{ height: BUNN_PLASS }} />}
          renderItem={({ item }) => {
            const laast = item.source !== "manuell" || !!item.invoice_draft_id;
            const egen = !!meg && item.registered_by === meg.user.id;
            const erstattet = !!item.replaced_by;
            return (
              <Kort onLongPress={!laast && egen ? () => setValgt(item) : undefined} style={erstattet ? s.erstattet : undefined}>
                <View style={s.rad}>
                  <Text style={s.elnr}>{item.item_no ?? "Fritekst"}</Text>
                  {item.source === "faktura" ? <Merke tekst="Fra faktura" /> : null}
                  {item.source === "pakkseddel" ? <Merke tekst="Fra pakkseddel" /> : null}
                </View>
                <Text style={s.navn}>{item.name}</Text>
                <View style={s.rad}>
                  <Text style={s.mengde}>{mengde(item.quantity, item.unit)}</Text>
                  <UtboksMerke rad={item._utboks} />
                </View>
                {item.note ? <Text style={s.notat}>{item.note}</Text> : null}
              </Kort>
            );
          }}
        />
      )}
      <FaneBunn tekst="+ Legg til materiell" onPress={() => router.push(`/ordrer/${id}/ny-materiell`)} />

      <Sheet synlig={!!valgt} onLukk={() => setValgt(null)} tittel={valgt ? `${mengde(valgt.quantity, valgt.unit)} ${valgt.name}` : ""}>
        <Knapp tekst="Slett linjen" variant="fare" stor onPress={slett} laster={sletter} />
        <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setValgt(null)} />
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  banner: { paddingHorizontal: 16, paddingTop: 8 },
  liste: { padding: 16, gap: 10 },
  erstattet: { opacity: 0.5 },
  rad: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  elnr: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer, ...tabellTall },
  navn: { fontSize: skrift.stor, fontWeight: "600", color: farge.tekst, marginTop: 2 },
  mengde: { fontSize: skrift.stor, fontWeight: "700", color: farge.tekst, marginTop: 4, ...tabellTall },
  notat: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 4 },
});
