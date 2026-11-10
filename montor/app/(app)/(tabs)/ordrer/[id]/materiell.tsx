import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FaneBunn } from "@/components/FaneBunn";
import { Banner, Gruppe, Knapp, Laster, Pille, Rad, Sheet, Tom, UtboksMerke } from "@/components/ui";
import { api, feilTekst } from "@/lib/api";
import { mengde } from "@/lib/format";
import { kvitter } from "@/lib/kvittering";
import { useInvaliderOrdre, useMeg, useOrdreMedUtboks, type MateriellRad } from "@/lib/sporringar";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import { useOrdreId } from "@/lib/useOrdreId";
import { slett as slettUtboks } from "@/lib/utboks/db";

/** Materiell på ordren. Linjer fra faktura er låst; egne manuelle kan slettes med et trykk. */
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
      kvitter("Linjen er slettet");
    } catch (e) {
      setValgt(null);
      setFeil(feilTekst(e));
    } finally {
      setSletter(false);
    }
  };

  // Linjer en fakturalinje har erstattet er ute av summene — de vises ikke.
  const linjer = sammenslaatt.materiell.filter((m) => !m.replaced_by);

  return (
    <View style={s.fyll}>
      {isPending && !data ? (
        <Laster />
      ) : (
        <ScrollView contentContainerStyle={s.liste} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={farge.tekstTertiaer} />}>
          {feil ? <Banner tekst={feil} /> : null}
          {linjer.length === 0 ? (
            <Tom ikon="cube-outline" tekst="Ingen materiell ført ennå" under="Søk i katalogen eller skann strekkoden på varen." />
          ) : (
            <Gruppe>
              {linjer.map((m) => {
                const laast = m.source !== "manuell" || !!m.invoice_draft_id;
                const egen = !!meg && m.registered_by === meg.user.id;
                return (
                  <Rad key={m.id} onPress={!laast && egen ? () => setValgt(m) : undefined} hoyre={<Text style={s.mengde}>{mengde(m.quantity, m.unit)}</Text>}>
                    <Text style={skrift.overskrift}>{m.name}</Text>
                    <View style={s.under}>
                      <Text style={[skrift.under, tabellTall]}>{m.item_no ?? "Fritekst"}</Text>
                      {m.source === "faktura" ? <Pille tekst="Fra faktura" /> : null}
                      {m.source === "pakkseddel" ? <Pille tekst="Fra pakkseddel" /> : null}
                      <UtboksMerke rad={m._utboks} />
                    </View>
                    {m.note ? <Text style={skrift.under}>{m.note}</Text> : null}
                  </Rad>
                );
              })}
            </Gruppe>
          )}
        </ScrollView>
      )}
      <FaneBunn tekst="Legg til materiell" onPress={() => router.push({ pathname: "/ny-materiell", params: { ordre: id } })} />

      <Sheet synlig={!!valgt} onLukk={() => setValgt(null)} tittel={valgt?.name} under={valgt ? mengde(valgt.quantity, valgt.unit) : ""}>
        <View style={s.arkKnapper}>
          <Knapp tekst="Slett linjen" variant="fare" stor onPress={slett} laster={sletter} />
          <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setValgt(null)} />
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  liste: { paddingHorizontal: marg, paddingTop: 16, paddingBottom: 24, gap: 14 },
  under: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  mengde: { fontSize: 17, fontWeight: "600", color: farge.tekst, ...tabellTall },
  arkKnapper: { gap: 8 },
});
