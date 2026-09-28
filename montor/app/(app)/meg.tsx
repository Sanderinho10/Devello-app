import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Knapp, Kort } from "@/components/ui";
import { tid } from "@/lib/format";
import { useMeg, useOrdrar } from "@/lib/sporringar";
import { supabase } from "@/lib/supabase";
import { farge, skrift, tabellTall } from "@/lib/tema";
import { antall, proevIgjen, slett, useUtboks } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";
import type { MateriellPayload, NotatPayload, StatusPayload, TimePayload, UtboksRad, UtboksType } from "@/lib/utboks/typer";

const TYPE_TEKST: Record<UtboksType, string> = {
  time: "Timer",
  materiell: "Materiell",
  notat: "Notat",
  bilete: "Bilde",
  status: "Status",
};

/** Navn, selskap, utboksen og «Logg ut». Versjonsnummer nederst. */
export default function Meg() {
  const inn = useSafeAreaInsets();
  const meg = useMeg().data;
  const ordrar = useOrdrar().data ?? [];
  const utboks = useUtboks();
  const qc = useQueryClient();
  const n = antall(utboks);

  const ordreNr = (id: string) => {
    const o = ordrar.find((x) => x.id === id);
    return o ? `#${o.order_no}` : "ordre";
  };

  const loggUt = async () => {
    await supabase.auth.signOut();
    qc.clear();
  };

  const spoerLoggUt = () => {
    const usendte = n.venter + n.sender;
    if (usendte > 0) {
      Alert.alert(
        "Usendte føringer",
        `Du har ${usendte} usendte føringer. Logg ut likevel? De blir liggende og sendes neste gang du er innlogget.`,
        [
          { text: "Avbryt", style: "cancel" },
          { text: "Logg ut", style: "destructive", onPress: loggUt },
        ],
      );
    } else {
      loggUt();
    }
  };

  return (
    <ScrollView style={s.fyll} contentContainerStyle={[s.innhold, { paddingTop: inn.top + 16, paddingBottom: 40 }]}>
      <Text style={s.overskrift}>Meg</Text>
      <Kort>
        <Text style={s.navn}>{meg?.user.full_name || meg?.user.email}</Text>
        <Text style={s.sekundaer}>{meg?.user.email}</Text>
        <Text style={s.sekundaer}>{meg?.company.name}</Text>
      </Kort>

      <Text style={s.delTittel}>Utboks</Text>
      <Text style={s.sekundaer}>
        {utboks.length === 0 ? "Alt er sendt." : `${n.venter + n.sender} venter · ${n.feil} feilet`}
      </Text>
      {utboks
        .slice()
        .reverse()
        .map((r) => (
          <UtboksRadKort key={r.id} rad={r} ordre={ordreNr(r.ordre_id)} />
        ))}

      <View style={s.bunn}>
        <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={spoerLoggUt} />
        <Text style={s.versjon}>Devello Montør {Constants.expoConfig?.version ?? ""}</Text>
      </View>
    </ScrollView>
  );
}

function beskrivelse(r: UtboksRad): string {
  switch (r.type) {
    case "time": {
      const p = JSON.parse(r.payload) as TimePayload;
      return `${p.hours} t ${p.time_type_name}`;
    }
    case "materiell": {
      const p = JSON.parse(r.payload) as MateriellPayload;
      return `${p.quantity} ${p.unit} ${p.name}`;
    }
    case "notat":
      return (JSON.parse(r.payload) as NotatPayload).text.slice(0, 60);
    case "bilete":
      return "Bilde til notat";
    case "status":
      return (JSON.parse(r.payload) as StatusPayload).status === "ferdig" ? "Merk som ferdig" : "Start jobben";
  }
}

function UtboksRadKort({ rad, ordre }: { rad: UtboksRad; ordre: string }) {
  const feilet = rad.status === "feil";
  return (
    <Kort>
      <View style={s.radTopp}>
        <Text style={s.radType}>
          {TYPE_TEKST[rad.type]} · {ordre}
        </Text>
        <Text style={s.radTid}>{tid(rad.laga_kl)}</Text>
      </View>
      <Text style={s.radTekst} numberOfLines={2}>
        {beskrivelse(rad)}
      </Text>
      <Text style={[s.radStatus, feilet && s.feil]}>
        {feilet ? `Feilet: ${rad.feil ?? "ukjent feil"}` : rad.status === "sender" ? "Sender …" : rad.feil ? `Venter · ${rad.feil}` : "Venter på nett"}
      </Text>
      <View style={s.radKnapper}>
        {feilet ? (
          <Knapp
            tekst="Prøv igjen"
            variant="sekundaer"
            onPress={async () => {
              await proevIgjen(rad.id);
              kjoer();
            }}
          />
        ) : null}
        <Knapp tekst="Slett" variant="lenke" onPress={() => slett(rad.id)} />
      </View>
    </Kort>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: 16, gap: 12 },
  overskrift: { fontSize: 30, fontWeight: "800", color: farge.tekst, marginBottom: 4 },
  navn: { fontSize: skrift.stor, fontWeight: "700", color: farge.tekst },
  sekundaer: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: 2 },
  delTittel: { fontSize: skrift.tittel, fontWeight: "700", color: farge.tekst, marginTop: 16 },
  radTopp: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  radType: { fontSize: skrift.liten, fontWeight: "700", color: farge.tekstSekundaer, ...tabellTall },
  radTid: { fontSize: skrift.liten, color: farge.tekstTertiaer },
  radTekst: { fontSize: skrift.normal, color: farge.tekst, marginTop: 4 },
  radStatus: { fontSize: skrift.liten, color: farge.advarsel, marginTop: 6, fontWeight: "600" },
  feil: { color: farge.negativ },
  radKnapper: { flexDirection: "row", gap: 8, marginTop: 8, justifyContent: "flex-end" },
  bunn: { marginTop: 32, gap: 12, alignItems: "center" },
  versjon: { fontSize: skrift.liten, color: farge.tekstTertiaer },
});
