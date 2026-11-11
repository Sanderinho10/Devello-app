import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { OfflineBanner } from "@/components/Offline";
import { PushKort } from "@/components/PushKort";
import { Banner, Gruppe, Ikon, Laster, Rad, Tom, type IkonNavn } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { tid } from "@/lib/format";
import { useMerkLest, useVarsel } from "@/lib/sporringar";
import { farge, marg, skrift } from "@/lib/tema";
import type { Varsel } from "@/lib/typer";
import { varselMaal } from "@/lib/varselMaal";

const TYPE: Record<string, { ikon: IkonNavn; farge: string }> = {
  nytt_oppdrag: { ikon: "add-circle", farge: farge.aksent },
  endra_oppdrag: { ikon: "time", farge: farge.advarsel },
  fjerna_oppdrag: { ikon: "close-circle", farge: farge.tekstTertiaer },
};

/**
 * Alle varsler, også de som ikke kom fram som push. Uleste har en blå
 * prikk. Trykk åpner ordren (eller programmet når oppdraget er tatt bort).
 * Det som er sett blir merket lest når lista lukkes.
 */
export default function Varsler() {
  const router = useRouter();
  const varsel = useVarsel();
  const merkLest = useMerkLest();
  const liste = varsel.data?.varsel ?? [];

  // Det montøren har hatt på skjermen er lest — uten at han må trykke på hvert.
  const sett = useRef(new Set<string>());
  const merk = useRef(merkLest);
  useEffect(() => {
    merk.current = merkLest;
    for (const v of liste) if (!v.read_at) sett.current.add(v.id);
  });
  useEffect(() => {
    const ids = sett.current;
    return () => merk.current([...ids]);
  }, []);

  const aapne = (v: Varsel) => {
    router.back();
    router.navigate(varselMaal({ type: v.kind, order_id: v.order_id }));
  };

  return (
    <ScrollView
      style={s.fyll}
      contentContainerStyle={s.innhold}
      refreshControl={<RefreshControl refreshing={varsel.isRefetching} onRefresh={() => void varsel.refetch()} tintColor={farge.tekstTertiaer} />}
    >
      <OfflineBanner />
      <PushKort alle />
      {varsel.error && !varsel.data ? <Banner tekst={feilTekst(varsel.error)} handling="Prøv igjen" onHandling={() => varsel.refetch()} /> : null}

      {varsel.isPending && !varsel.data ? (
        <Laster />
      ) : liste.length === 0 ? (
        <Tom ikon="notifications-outline" tekst="Ingen varsler ennå" under="Du får beskjed her når kontoret setter deg opp på et oppdrag, flytter det eller tar deg av det." />
      ) : (
        <Gruppe>
          {liste.map((v) => {
            const type = TYPE[v.kind] ?? { ikon: "notifications" as IkonNavn, farge: farge.tekstTertiaer };
            const ulest = !v.read_at;
            return (
              <Rad key={v.id} onPress={() => aapne(v)} pil style={s.rad}>
                <View style={s.linje}>
                  <View style={s.ikon}>
                    <Ikon navn={type.ikon} storleik={24} farge={type.farge} />
                  </View>
                  <View style={s.tekst}>
                    <Text style={[skrift.overskrift, !ulest && s.lest]}>{v.title}</Text>
                    <Text style={skrift.under}>{v.body}</Text>
                    <Text style={skrift.liten}>{tid(v.created_at)}</Text>
                  </View>
                  {ulest ? <View style={s.prikk} accessibilityLabel="Ulest" /> : null}
                </View>
              </Rad>
            );
          })}
        </Gruppe>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 40, gap: 14 },
  rad: { paddingVertical: 14 },
  linje: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  ikon: { paddingTop: 1 },
  tekst: { flex: 1, gap: 3 },
  lest: { fontWeight: "500" },
  prikk: { width: 10, height: 10, borderRadius: 5, backgroundColor: farge.aksent, marginTop: 7 },
});
