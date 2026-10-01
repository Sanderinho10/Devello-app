import { useRouter } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Miniatyr } from "@/components/Bilde";
import { BUNN_PLASS, FaneBunn } from "@/components/FaneBunn";
import { Kort, Laster, Tom, UtboksMerke } from "@/components/ui";
import { tid } from "@/lib/format";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, skrift } from "@/lib/tema";

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
        <FlatList
          data={sammenslaatt.notat}
          keyExtractor={(n) => n.id}
          contentContainerStyle={s.liste}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={farge.aksent} />}
          ListEmptyComponent={<Tom tekst="Ingen notater ennå." />}
          ListFooterComponent={<View style={{ height: BUNN_PLASS }} />}
          renderItem={({ item }) => (
            <Kort>
              <View style={s.rad}>
                <Text style={s.navn}>{item.user_name}</Text>
                <Text style={s.tid}>{tid(item.created_at)}</Text>
              </View>
              <Text style={s.tekst}>{item.text}</Text>
              {item.bilete.length ? (
                <View style={s.bilder}>
                  {item.bilete.map((b) => (
                    <Miniatyr
                      key={b.id}
                      ordreId={id}
                      bilde={b}
                      onPress={() =>
                        router.push({
                          pathname: "/ordrer/[id]/bilete/[docId]",
                          params: { id, docId: b.id, uri: b.lokal_uri ?? "" },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
              <UtboksMerke rad={item._utboks} />
            </Kort>
          )}
        />
      )}
      <FaneBunn tekst="+ Nytt notat" onPress={() => router.push(`/ordrer/${id}/nytt-notat`)} />
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  liste: { padding: 16, gap: 10 },
  rad: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  navn: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer },
  tid: { fontSize: skrift.liten, color: farge.tekstTertiaer },
  tekst: { fontSize: skrift.normal, color: farge.tekst, marginTop: 4, lineHeight: 22 },
  bilder: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
});
