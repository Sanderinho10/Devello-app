import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FaneBunn } from "@/components/FaneBunn";
import { Banner, Gruppe, Knapp, Laster, Rad, Sheet, Tom, UtboksMerke } from "@/components/ui";
import { api, feilTekst } from "@/lib/api";
import { dagTittel, fraIsoDato, timer as fmtTimer } from "@/lib/format";
import { kvitter } from "@/lib/kvittering";
import { useInvaliderOrdre, useMeg, useOrdreMedUtboks, type TimeRad } from "@/lib/sporringar";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import { useOrdreId } from "@/lib/useOrdreId";
import { slett as slettUtboks } from "@/lib/utboks/db";

/** Timer på ordren, dag for dag med sum, nyeste først. Trykk på en egen rad for å slette den. */
export default function TimerFane() {
  const id = useOrdreId();
  const router = useRouter();
  const meg = useMeg().data;
  const { sammenslaatt, isPending, isRefetching, refetch, data } = useOrdreMedUtboks(id);
  const invalider = useInvaliderOrdre();
  const [valgt, setValgt] = useState<TimeRad | null>(null);
  const [feil, setFeil] = useState<string | null>(null);
  const [sletter, setSletter] = useState(false);

  const dager = useMemo(() => {
    const perDag = new Map<string, TimeRad[]>();
    for (const t of sammenslaatt.timer) perDag.set(t.work_date, [...(perDag.get(t.work_date) ?? []), t]);
    return [...perDag.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [sammenslaatt.timer]);

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
      kvitter("Timeføringen er slettet");
    } catch (e) {
      setValgt(null);
      setFeil(feilTekst(e));
    } finally {
      setSletter(false);
    }
  };

  return (
    <View style={s.fyll}>
      {isPending && !data ? (
        <Laster />
      ) : (
        <ScrollView contentContainerStyle={s.liste} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={farge.tekstTertiaer} />}>
          {feil ? <Banner tekst={feil} /> : null}
          {dager.length === 0 ? <Tom ikon="time-outline" tekst="Ingen timer ført ennå" under="Trykk «Før timer» når du har vært på jobben." /> : null}
          {dager.map(([dag, rader]) => {
            const d = fraIsoDato(dag);
            const sum = rader.reduce((n, t) => n + t.hours, 0);
            return (
              <Gruppe key={dag} tittel={d ? dagTittel(d) : dag} hoyre={fmtTimer(sum)}>
                {rader.map((t) => {
                  // Egne timer kan slettes — men ikke de som alt er med på et fakturaforslag.
                  const egen = !!meg && t.user_id === meg.user.id && !t.invoice_draft_id;
                  return (
                    <Rad key={t.id} onPress={egen ? () => setValgt(t) : undefined} hoyre={<Text style={s.timer}>{fmtTimer(t.hours)}</Text>}>
                      <Text style={skrift.overskrift}>{t.time_type_name}</Text>
                      <Text style={skrift.under}>{t.user_name}</Text>
                      {t.note ? <Text style={s.notat}>{t.note}</Text> : null}
                      {t._utboks ? (
                        <View style={s.merke}>
                          <UtboksMerke rad={t._utboks} />
                        </View>
                      ) : null}
                    </Rad>
                  );
                })}
              </Gruppe>
            );
          })}
        </ScrollView>
      )}
      <FaneBunn tekst="Før timer" onPress={() => router.push({ pathname: "/ny-time", params: { ordre: id } })} />

      <Sheet synlig={!!valgt} onLukk={() => setValgt(null)} tittel={valgt ? `${fmtTimer(valgt.hours)} ${valgt.time_type_name}` : ""} under={valgt ? dagTittel(fraIsoDato(valgt.work_date) ?? new Date()) : ""}>
        {valgt?.note ? <Text style={skrift.kropp}>{valgt.note}</Text> : null}
        <View style={s.arkKnapper}>
          <Knapp tekst="Slett timeføringen" variant="fare" stor onPress={slett} laster={sletter} />
          <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setValgt(null)} />
        </View>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  liste: { paddingHorizontal: marg, paddingTop: 16, paddingBottom: 24, gap: 18 },
  timer: { fontSize: 17, fontWeight: "600", color: farge.tekst, ...tabellTall },
  notat: { fontSize: 15, color: farge.tekst, marginTop: 2, lineHeight: 20 },
  merke: { marginTop: 4 },
  arkKnapper: { gap: 8 },
});
