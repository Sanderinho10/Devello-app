import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineBanner } from "@/components/Offline";
import { Banner, Knapp, Kort, Laster, Segment, Tom } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { dagTittel, klokke, tidsrom, timer as fmtTimer, ukedagDato } from "@/lib/format";
import { useKalender, useTimeforslag } from "@/lib/sporringar";
import { farge, radius, skrift, tabellTall } from "@/lib/tema";
import type { HendingType, KalenderHending, Timeforslag } from "@/lib/typer";

const TYPE_TEKST: Record<HendingType, string> = { oppdrag: "Oppdrag", mote: "Møte", fravaer: "Fravær", annet: "Annet" };
const TYPE_FARGE: Record<HendingType, { bak: string; tekst: string }> = {
  oppdrag: { bak: farge.aksentMyk, tekst: farge.aksent },
  mote: { bak: farge.positivMyk, tekst: farge.positiv },
  fravaer: { bak: farge.advarselMyk, tekst: farge.advarsel },
  annet: { bak: farge.kant, tekst: farge.tekstSekundaer },
};

type Visning = "mine" | "alle";

/**
 * Programmet: avtalene montøren er satt opp på, i dag først og 14 dager
 * fram. Øverst: oppdrag det ikke er ført timer for — ett trykk inn i
 * «Før timer» med dato, timer og timetype fylt ut.
 */
export default function Program() {
  const inn = useSafeAreaInsets();
  const router = useRouter();
  const [visning, setVisning] = useState<Visning>("mine");
  const kalender = useKalender(visning === "alle");
  const forslag = useTimeforslag();

  // «I dag» regnes fra når data sist kom, ikke fra hver render.
  const { naa, seksjoner } = useMemo(() => {
    const naa = new Date();
    const perDag = new Map<string, { dag: Date; hendingar: KalenderHending[] }>();
    for (const h of kalender.data ?? []) {
      const start = new Date(h.starts_at);
      // Avtaler som startet før i dag (pågående flerdagers) legges på i dag.
      const dag = start < startPaaDag(naa) ? startPaaDag(naa) : startPaaDag(start);
      const nokkel = dag.toISOString();
      const s = perDag.get(nokkel) ?? { dag, hendingar: [] };
      s.hendingar.push(h);
      perDag.set(nokkel, s);
    }
    const seksjoner = [...perDag.values()]
      .sort((a, b) => a.dag.getTime() - b.dag.getTime())
      .map((s) => ({
        title: dagTittel(s.dag, naa),
        under: ukedagDato(s.dag, naa),
        data: s.hendingar.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.starts_at.localeCompare(b.starts_at)),
      }));
    return { naa, seksjoner };
  }, [kalender.data]);

  const opneOrdre = (h: KalenderHending) => {
    if (h.order) router.push(`/ordrer/${h.order.id}/timer`);
  };

  const foerTimer = (f: Timeforslag) => {
    router.push({
      pathname: "/ordrer/[id]/ny-time",
      params: { id: f.order.id, dato: f.work_date, timar: String(f.timar), timetype: f.price_item_id ?? "" },
    });
  };

  const laster = kalender.isPending && !kalender.data;

  return (
    <View style={[s.fyll, { paddingTop: inn.top + 8 }]}>
      <View style={s.topp}>
        <Text style={s.overskrift}>Program</Text>
        <Segment
          valg={[
            { verdi: "mine", tekst: "Mine avtaler" },
            { verdi: "alle", tekst: "Hele firmaet" },
          ]}
          verdi={visning}
          onChange={setVisning}
        />
        <OfflineBanner />
        {kalender.error && !kalender.data ? (
          <Banner tekst={feilTekst(kalender.error)} handling="Prøv igjen" onHandling={() => kalender.refetch()} />
        ) : null}
      </View>

      {laster ? (
        <Laster />
      ) : (
        <SectionList
          sections={seksjoner}
          keyExtractor={(h) => h.id}
          contentContainerStyle={s.liste}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={kalender.isRefetching || forslag.isRefetching}
              onRefresh={() => {
                kalender.refetch();
                forslag.refetch();
              }}
              tintColor={farge.aksent}
            />
          }
          ListHeaderComponent={
            visning === "mine" && forslag.data?.length ? (
              <View style={s.forslag}>
                <Text style={s.delTittel}>Timer som ikke er ført</Text>
                {forslag.data.map((f) => (
                  <ForslagKort key={`${f.order.id}-${f.work_date}`} forslag={f} naa={naa} onPress={() => foerTimer(f)} />
                ))}
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <View style={s.dagHode}>
              <Text style={s.dagTittel}>{section.title}</Text>
              {section.title !== section.under ? <Text style={s.dagUnder}>{section.under}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => <HendingKort hending={item} visDeltakarar={visning === "alle"} naa={naa} onPress={item.order ? () => opneOrdre(item) : undefined} />}
          ListEmptyComponent={<Tom tekst={visning === "mine" ? "Ingen avtaler de neste 14 dagene." : "Ingen avtaler i firmaet de neste 14 dagene."} />}
        />
      )}
    </View>
  );
}

function startPaaDag(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function HendingKort({ hending: h, visDeltakarar, naa, onPress }: { hending: KalenderHending; visDeltakarar: boolean; naa: Date; onPress?: () => void }) {
  const f = TYPE_FARGE[h.kind] ?? TYPE_FARGE.annet;
  const stad = h.location || h.order?.site_address || null;
  return (
    <Kort onPress={onPress}>
      <View style={s.rad}>
        <Text style={s.tid}>{tidsrom(h.starts_at, h.ends_at, h.all_day, naa)}</Text>
        <View style={[s.type, { backgroundColor: f.bak }]}>
          <Text style={[s.typeTekst, { color: f.tekst }]}>{TYPE_TEKST[h.kind] ?? h.kind}</Text>
        </View>
      </View>
      <Text style={s.tittel}>{h.title}</Text>
      {h.order ? (
        <Text style={s.ordre}>
          #{h.order.order_no} · {h.order.customer_name}
        </Text>
      ) : null}
      {stad ? <Text style={s.stad}>{stad}</Text> : null}
      {h.description ? (
        <Text style={s.beskrivelse} numberOfLines={3}>
          {h.description}
        </Text>
      ) : null}
      {(visDeltakarar || h.deltakarar.length > 1) && h.deltakarar.length ? (
        <Text style={s.deltakarar}>{h.deltakarar.map((d) => d.navn).join(", ")}</Text>
      ) : null}
    </Kort>
  );
}

function ForslagKort({ forslag: f, naa, onPress }: { forslag: Timeforslag; naa: Date; onPress: () => void }) {
  const fra = new Date(f.fra);
  const til = new Date(f.til);
  return (
    <Kort style={s.forslagKort}>
      <Text style={s.forslagTid}>
        {dagTittel(fra, naa)} {klokke(fra)}–{klokke(til)}
      </Text>
      <Text style={s.tittel}>
        #{f.order.order_no} · {f.order.title}
      </Text>
      <Text style={s.ordre}>{f.order.customer_name}</Text>
      <Knapp tekst={`Før ${fmtTimer(f.timar)}`} onPress={onPress} style={s.forslagKnapp} />
    </Kort>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  topp: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  overskrift: { fontSize: 30, fontWeight: "800", color: farge.tekst },
  liste: { padding: 16, paddingTop: 8, gap: 10, paddingBottom: 32 },
  forslag: { gap: 10, marginBottom: 8 },
  forslagKort: { borderColor: farge.advarsel, borderWidth: 1 },
  forslagTid: { fontSize: skrift.liten, fontWeight: "700", color: farge.advarsel, ...tabellTall },
  forslagKnapp: { marginTop: 10 },
  delTittel: { fontSize: skrift.stor, fontWeight: "700", color: farge.tekst },
  dagHode: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 12, marginBottom: 2 },
  dagTittel: { fontSize: skrift.tittel, fontWeight: "700", color: farge.tekst },
  dagUnder: { fontSize: skrift.normal, color: farge.tekstSekundaer },
  rad: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  tid: { fontSize: skrift.normal, fontWeight: "700", color: farge.tekst, ...tabellTall },
  type: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  typeTekst: { fontSize: skrift.liten, fontWeight: "600" },
  tittel: { fontSize: skrift.stor, fontWeight: "600", color: farge.tekst, marginTop: 4 },
  ordre: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 2, ...tabellTall },
  stad: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 2 },
  beskrivelse: { fontSize: skrift.normal, color: farge.tekst, marginTop: 6 },
  deltakarar: { fontSize: skrift.liten, color: farge.tekstTertiaer, marginTop: 6 },
});
