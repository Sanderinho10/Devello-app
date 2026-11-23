import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FaneBunn } from "@/components/FaneBunn";
import { Gruppe, Laster, Pille, Rad, Tom } from "@/components/ui";
import { mengde } from "@/lib/format";
import { useOrdreMedUtboks } from "@/lib/sporringar";
import { farge, marg, radius, skrift, skygge, tabellTall } from "@/lib/tema";
import type { OrderType } from "@/lib/typer";
import { useOrdreId } from "@/lib/useOrdreId";

const ORDRETYPE: Record<OrderType, string> = { fastpris: "Fastpris", tid_og_materiell: "Timer og materiell" };
const TILBUDSTYPE = { punktpris: "Punktpris", fastpris: "Fastpris", tid_og_materiell: "Tid og materiell" } as const;

/**
 * Jobben: hva som skal gjøres, og tilbudet kunden sa ja til.
 *
 * Øverst arbeidsbeskrivelsen og ordretypen. Under står tilbudet post for
 * post, med antall — det er dette som er avtalt, og det montøren måler
 * jobben mot. Uten priser. Ble noe annerledes ute på jobben, melder
 * montøren det med «Meld endring»: endringene lagres som et notat på
 * ordren, og tilbudet står som det er.
 */
export default function JobbenFane() {
  const id = useOrdreId();
  const router = useRouter();
  const { sammenslaatt, isPending, isRefetching, refetch, data } = useOrdreMedUtboks(id);
  const { ordre, tilbud } = sammenslaatt;
  const harLinjer = !!tilbud && tilbud.sections.some((s) => s.lines.length > 0);

  return (
    <View style={s.fyll}>
      {isPending && !data ? (
        <Laster />
      ) : (
        <ScrollView contentContainerStyle={s.liste} refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={farge.tekstTertiaer} />}>
          <View>
            <View style={s.hode}>
              <Text style={skrift.etikett}>Beskrivelse</Text>
              {ordre?.order_type ? <Pille tekst={ORDRETYPE[ordre.order_type]} /> : null}
            </View>
            <View style={s.kort}>
              {ordre?.description ? (
                <Text style={s.beskrivelse}>{ordre.description}</Text>
              ) : (
                <Text style={skrift.under}>Kontoret har ikke skrevet noen beskrivelse på denne ordren.</Text>
              )}
            </View>
          </View>

          {tilbud ? (
            <>
              <View style={s.hode}>
                <Text style={skrift.etikett}>
                  Tilbudet{tilbud.quote_no ? ` ${tilbud.quote_no}` : ""} · {TILBUDSTYPE[tilbud.quote_type] ?? ""}
                </Text>
              </View>
              {tilbud.title ? <Text style={s.tilbudTittel}>{tilbud.title}</Text> : null}
              {!harLinjer ? (
                <View style={s.kort}>
                  <Text style={skrift.under}>
                    {tilbud.quote_type === "tid_og_materiell"
                      ? "Tilbudet er tid og materiell. Før timene og materiellet du bruker — det er det som faktureres."
                      : "Tilbudet har ingen poster."}
                  </Text>
                </View>
              ) : (
                tilbud.sections.map((seksjon, i) => (
                  <Gruppe key={i} tittel={seksjon.title} hoyre={`${seksjon.lines.length} ${seksjon.lines.length === 1 ? "post" : "poster"}`}>
                    {seksjon.lines.map((l, j) => (
                      <Rad key={j} hoyre={<Text style={s.antall}>{mengde(l.quantity, l.unit)}</Text>}>
                        <Text style={s.post}>{l.description}</Text>
                      </Rad>
                    ))}
                  </Gruppe>
                ))
              )}
              {tilbud.assumptions.length ? (
                <View>
                  <View style={s.hode}>
                    <Text style={skrift.etikett}>Forutsetninger i tilbudet</Text>
                  </View>
                  <View style={s.kort}>
                    {tilbud.assumptions.map((a, i) => (
                      <Text key={i} style={s.forutsetning}>
                        • {a}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
              <Text style={skrift.liten}>Slik tilbudet var da kunden sa ja. Ble jobben annerledes, meld endringen — den lagres som et notat kontoret ser.</Text>
            </>
          ) : (
            <Tom ikon="document-text-outline" tekst="Ordren har ikke noe tilbud" under="Jobben er opprettet direkte på kontoret. Beskrivelsen over er det som gjelder." />
          )}
        </ScrollView>
      )}
      {harLinjer ? (
        <FaneBunn tekst="Meld endring fra tilbudet" ikon="create-outline" onPress={() => router.push({ pathname: "/endring", params: { ordre: id } })} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1 },
  liste: { paddingHorizontal: marg, paddingTop: 16, paddingBottom: 24, gap: 16 },
  hode: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4, marginBottom: 8 },
  kort: { backgroundColor: farge.flate, borderRadius: radius.lg, padding: 14, gap: 6, ...skygge },
  beskrivelse: { fontSize: 17, lineHeight: 25, letterSpacing: -0.2, color: farge.tekst },
  tilbudTittel: { ...skrift.overskrift, paddingHorizontal: 4, marginTop: -8 },
  post: { fontSize: 16, lineHeight: 22, letterSpacing: -0.2, color: farge.tekst },
  antall: { fontSize: 17, fontWeight: "600", color: farge.tekst, ...tabellTall },
  forutsetning: { fontSize: 15, lineHeight: 21, color: farge.tekstSekundaer },
});
