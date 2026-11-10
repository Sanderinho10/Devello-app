import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Miniatyr } from "@/components/Bilde";
import { FaneBunn } from "@/components/FaneBunn";
import { Avatar, Gruppe, Laster, Rad, Tom, UtboksMerke } from "@/components/ui";
import { tid } from "@/lib/format";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, marg, skrift } from "@/lib/tema";
import { useOrdreId } from "@/lib/useOrdreId";

/** Notater med bilder, nyeste først. Trykk på et bilde → fullskjerm. */
export default function NotaterFane() {
  const id = useOrdreId();
  const router = useRouter();
  const { sammenslaatt, isPending, isRefetching, refetch, data } = useOrdreMedUtboks(id);

  return (
    <View style={s.fyll}>
      {isPending && !data ? (
        <Laster />
      ) : (
        <ScrollView contentContainerStyle={s.liste} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={farge.tekstTertiaer} />}>
          {sammenslaatt.notat.length === 0 ? (
            <Tom ikon="chatbubble-ellipses-outline" tekst="Ingen notater ennå" under="Skriv det kontoret og kollegaene bør vite, gjerne med bilde." />
          ) : (
            <Gruppe>
              {sammenslaatt.notat.map((n) => (
                <Rad key={n.id} style={s.rad}>
                  <View style={s.hode}>
                    <Avatar navn={n.user_name} storleik={32} />
                    <View style={s.hvem}>
                      <Text style={skrift.overskrift}>{n.user_name}</Text>
                      <Text style={skrift.liten}>{tid(n.created_at)}</Text>
                    </View>
                    <UtboksMerke rad={n._utboks} />
                  </View>
                  <Text style={s.tekst}>{n.text}</Text>
                  {n.bilete.length ? (
                    <View style={s.bilder}>
                      {n.bilete.map((b) => (
                        <Miniatyr
                          key={b.id}
                          ordreId={id}
                          bilde={b}
                          onPress={() => router.push({ pathname: "/bilete", params: { ordre: id, doc: b.id, uri: b.lokal_uri ?? "" } })}
                        />
                      ))}
                    </View>
                  ) : null}
                </Rad>
              ))}
            </Gruppe>
          )}
        </ScrollView>
      )}
      <FaneBunn tekst="Nytt notat" ikon="create-outline" onPress={() => router.push({ pathname: "/nytt-notat", params: { ordre: id } })} />
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  liste: { paddingHorizontal: marg, paddingTop: 16, paddingBottom: 24 },
  rad: { alignItems: "flex-start", paddingVertical: 14 },
  hode: { flexDirection: "row", alignItems: "center", gap: 10 },
  hvem: { flex: 1 },
  tekst: { fontSize: 16, lineHeight: 23, letterSpacing: -0.2, color: farge.tekst, marginTop: 8 },
  bilder: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
});
