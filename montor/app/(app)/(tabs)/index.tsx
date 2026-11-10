import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Gruppe, Ikon, Knapp, Laster, Rad, Segment, Skjermhode, Tom } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { dagTittel, klokke, kortDato, langDato, tidsrom, timer as fmtTimer, ukedagDato, ukedagStor } from "@/lib/format";
import { useKalender, useTimeforslag } from "@/lib/sporringar";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import type { HendingType, KalenderHending, Timeforslag } from "@/lib/typer";

const TYPE_TEKST: Record<HendingType, string> = { oppdrag: "Oppdrag", mote: "Møte", fravaer: "Fravær", annet: "Annet" };
/** Fargen på streken til venstre for avtalen — de samme som i kalenderen på nett. */
const TYPE_FARGE: Record<HendingType, string> = {
  oppdrag: farge.aksent,
  mote: farge.mote,
  fravaer: farge.advarsel,
  annet: farge.tekstTertiaer,
};

type Visning = "mine" | "alle";

function startPaaDag(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Programmet: avtalene montøren er satt opp på, i dag først og 14 dager
 * fram. Øverst: oppdrag det ikke er ført timer for — ett trykk inn i
 * «Før timer» med dato, timer og timetype fylt ut.
 */
export default function Program() {
  const router = useRouter();
  const [visning, setVisning] = useState<Visning>("mine");
  const kalender = useKalender(visning === "alle");
  const forslag = useTimeforslag();

  // «I dag» regnes fra når data sist kom, ikke fra hver render.
  const { naa, dager } = useMemo(() => {
    const naa = new Date();
    const perDag = new Map<number, { dag: Date; hendingar: KalenderHending[] }>();
    for (const h of kalender.data ?? []) {
      const start = new Date(h.starts_at);
      // Avtaler som startet før i dag (pågående flerdagers) legges på i dag.
      const dag = start < startPaaDag(naa) ? startPaaDag(naa) : startPaaDag(start);
      const s = perDag.get(dag.getTime()) ?? { dag, hendingar: [] };
      s.hendingar.push(h);
      perDag.set(dag.getTime(), s);
    }
    const dager = [...perDag.values()]
      .sort((a, b) => a.dag.getTime() - b.dag.getTime())
      .map((s) => ({
        ...s,
        hendingar: s.hendingar.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at)),
      }));
    return { naa, dager };
  }, [kalender.data]);

  const foerTimer = (f: Timeforslag) => {
    router.push({ pathname: "/ny-time", params: { ordre: f.order.id, dato: f.work_date, timar: String(f.timar), timetype: f.price_item_id ?? "" } });
  };

  const laster = kalender.isPending && !kalender.data;
  const visForslag = visning === "mine" && !!forslag.data?.length;

  return (
    <View style={s.fyll}>
      <Skjermhode tittel="Program" over={langDato(naa)}>
        <Segment
          valg={[
            { verdi: "mine", tekst: "Mine avtaler" },
            { verdi: "alle", tekst: "Hele firmaet" },
          ]}
          verdi={visning}
          onChange={setVisning}
        />
      </Skjermhode>

      <ScrollView
        contentContainerStyle={s.innhold}
        refreshControl={
          <RefreshControl
            refreshing={kalender.isRefetching || forslag.isRefetching}
            onRefresh={() => {
              void kalender.refetch();
              void forslag.refetch();
            }}
            tintColor={farge.tekstTertiaer}
          />
        }
      >
        <OfflineBanner />
        {kalender.error && !kalender.data ? <Banner tekst={feilTekst(kalender.error)} handling="Prøv igjen" onHandling={() => kalender.refetch()} /> : null}

        {visForslag ? (
          <Gruppe tittel="Timer som ikke er ført">
            {forslag.data!.map((f) => {
              const fra = new Date(f.fra);
              const til = new Date(f.til);
              return (
                <Rad key={`${f.order.id}-${f.work_date}`} hoyre={<Knapp tekst={`Før ${fmtTimer(f.timar)}`} onPress={() => foerTimer(f)} style={s.forslagKnapp} />}>
                  <Text style={s.forslagTid}>
                    {dagTittel(fra, naa)} {klokke(fra)}–{klokke(til)}
                  </Text>
                  <Text style={skrift.overskrift} numberOfLines={1}>
                    {f.order.title}
                  </Text>
                  <Text style={[skrift.under, tabellTall]} numberOfLines={1}>
                    #{f.order.order_no} · {f.order.customer_name}
                  </Text>
                </Rad>
              );
            })}
          </Gruppe>
        ) : null}

        {laster ? (
          <Laster />
        ) : dager.length === 0 ? (
          <Tom
            ikon="calendar-outline"
            tekst={visning === "mine" ? "Ingen avtaler de neste 14 dagene" : "Ingen avtaler i firmaet de neste 14 dagene"}
            under="Kontoret setter opp programmet i nettappen."
          />
        ) : (
          dager.map(({ dag, hendingar }) => {
            // «I dag  tir. 10. nov», deretter «Torsdag  12. nov».
            const naer = dagTittel(dag, naa) !== ukedagDato(dag, naa);
            return (
            <View key={dag.getTime()} style={s.dag}>
              <View style={s.dagHode}>
                <Text style={skrift.tittel}>{naer ? dagTittel(dag, naa) : ukedagStor(dag)}</Text>
                <Text style={skrift.under}>{naer ? ukedagDato(dag, naa) : kortDato(dag, naa)}</Text>
              </View>
              <Gruppe>
                {hendingar.map((h) => (
                  <Hending key={h.id} hending={h} visDeltakarar={visning === "alle"} naa={naa} onPress={h.order ? () => router.push(`/ordrer/${h.order!.id}/timer`) : undefined} />
                ))}
              </Gruppe>
            </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function Hending({ hending: h, visDeltakarar, naa, onPress }: { hending: KalenderHending; visDeltakarar: boolean; naa: Date; onPress?: () => void }) {
  const stad = h.location || h.order?.site_address || null;
  const start = new Date(h.starts_at);
  const slutt = new Date(h.ends_at);
  const sammeDag = start.toDateString() === slutt.toDateString();
  const enkelTid = !h.all_day && sammeDag;
  return (
    <Rad onPress={onPress} pil={!!onPress} style={s.hending}>
      <View style={s.hendingRad}>
        <View style={s.tid}>
          {enkelTid ? (
            <>
              <Text style={s.tidStart}>{klokke(start)}</Text>
              <Text style={s.tidSlutt}>{klokke(slutt)}</Text>
            </>
          ) : (
            <Text style={s.tidHele}>{h.all_day ? "Hele dagen" : klokke(start)}</Text>
          )}
        </View>
        <View style={[s.strek, { backgroundColor: TYPE_FARGE[h.kind] ?? farge.tekstTertiaer }]} />
        <View style={s.tekst}>
          <Text style={skrift.overskrift}>{h.title}</Text>
          {h.order ? (
            <Text style={[skrift.under, tabellTall]}>
              #{h.order.order_no} · {h.order.customer_name}
            </Text>
          ) : (
            <Text style={[skrift.under, { color: TYPE_FARGE[h.kind] }]}>{TYPE_TEKST[h.kind] ?? h.kind}</Text>
          )}
          {!enkelTid ? <Text style={skrift.under}>{tidsrom(h.starts_at, h.ends_at, h.all_day, naa)}</Text> : null}
          {stad ? (
            <View style={s.linje}>
              <Ikon navn="location-outline" storleik={15} farge={farge.tekstTertiaer} />
              <Text style={[skrift.under, s.linjeTekst]}>{stad}</Text>
            </View>
          ) : null}
          {h.description ? (
            <Text style={s.beskrivelse} numberOfLines={3}>
              {h.description}
            </Text>
          ) : null}
          {(visDeltakarar || h.deltakarar.length > 1) && h.deltakarar.length ? (
            <View style={s.linje}>
              <Ikon navn="people-outline" storleik={15} farge={farge.tekstTertiaer} />
              <Text style={[skrift.liten, s.linjeTekst]}>{h.deltakarar.map((d) => d.navn).join(", ")}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Rad>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 6, paddingBottom: 32, gap: 14 },
  forslagTid: { fontSize: 13, fontWeight: "600", color: farge.advarsel, ...tabellTall },
  forslagKnapp: { minHeight: 40, paddingHorizontal: 16 },
  dag: { gap: 8, marginTop: 6 },
  dagHode: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingHorizontal: 4 },
  hending: { alignItems: "center", paddingVertical: 12 },
  hendingRad: { flexDirection: "row", gap: 12 },
  tid: { width: 50, paddingTop: 1 },
  tidStart: { fontSize: 15, fontWeight: "600", color: farge.tekst, ...tabellTall },
  tidSlutt: { fontSize: 15, color: farge.tekstTertiaer, ...tabellTall },
  tidHele: { fontSize: 13, fontWeight: "600", color: farge.tekst, ...tabellTall },
  strek: { width: 4, borderRadius: 2, alignSelf: "stretch" },
  tekst: { flex: 1, gap: 2 },
  linje: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 1 },
  linjeTekst: { flex: 1 },
  beskrivelse: { fontSize: 15, color: farge.tekst, marginTop: 3, lineHeight: 20 },
});
