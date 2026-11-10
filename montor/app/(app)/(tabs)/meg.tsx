import Constants from "expo-constants";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar, Gruppe, Ikon, Knapp, Pille, Rad, Sheet, Skjermhode, type IkonNavn } from "@/components/ui";
import { mengde, tid, timer } from "@/lib/format";
import { kvitter } from "@/lib/kvittering";
import { useMeg, useOrdrar } from "@/lib/sporringar";
import { supabase } from "@/lib/supabase";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import { antall, proevIgjen, slett, useUtboks } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";
import type { MateriellPayload, NotatPayload, StatusPayload, TimePayload, UtboksRad, UtboksType } from "@/lib/utboks/typer";

const TYPE: Record<UtboksType, { tekst: string; ikon: IkonNavn }> = {
  time: { tekst: "Timer", ikon: "time-outline" },
  materiell: { tekst: "Materiell", ikon: "cube-outline" },
  notat: { tekst: "Notat", ikon: "chatbubble-ellipses-outline" },
  bilete: { tekst: "Bilde", ikon: "image-outline" },
  status: { tekst: "Status", ikon: "flag-outline" },
};

function beskrivelse(r: UtboksRad): string {
  switch (r.type) {
    case "time": {
      const p = JSON.parse(r.payload) as TimePayload;
      return `${timer(p.hours)} ${p.time_type_name}`;
    }
    case "materiell": {
      const p = JSON.parse(r.payload) as MateriellPayload;
      return `${mengde(p.quantity, p.unit)} ${p.name}`;
    }
    case "notat":
      return (JSON.parse(r.payload) as NotatPayload).text;
    case "bilete":
      return "Bilde til notat";
    case "status":
      return (JSON.parse(r.payload) as StatusPayload).status === "ferdig" ? "Merk som ferdig" : "Start jobben";
  }
}

function statusTekst(r: UtboksRad): string {
  if (r.status === "feil") return r.feil ?? "Ukjent feil";
  if (r.status === "sender") return "Sender nå";
  if (r.type === "bilete" && r.avhengig_av && !r.feil) return "Sendes etter notatet";
  return r.feil && r.feil !== "Ingen dekning" ? `Prøver igjen · ${r.feil}` : "Sendes når du har dekning";
}

/** Hvem som er innlogget, utboksen, og «Logg ut». Versjonsnummer nederst. */
export default function Meg() {
  const meg = useMeg().data;
  const ordrar = useOrdrar().data ?? [];
  const utboks = useUtboks();
  const n = antall(utboks);
  const [valgt, setValgt] = useState<UtboksRad | null>(null);

  const ordreNr = (id: string) => {
    const o = ordrar.find((x) => x.id === id);
    return o ? `#${o.order_no}` : "ordre";
  };

  const loggUt = () => supabase.auth.signOut();

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

  const navn = meg?.user.full_name || meg?.user.email || "";

  return (
    <View style={s.fyll}>
      <Skjermhode tittel="Meg" />
      <ScrollView contentContainerStyle={s.innhold}>
        <Gruppe>
          <Rad>
            <View style={s.profil}>
              <Avatar navn={navn} storleik={52} />
              <View style={s.profilTekst}>
                <Text style={skrift.tittel} numberOfLines={1}>
                  {navn}
                </Text>
                {meg?.user.full_name ? (
                  <Text style={skrift.under} numberOfLines={1}>
                    {meg.user.email}
                  </Text>
                ) : null}
              </View>
            </View>
          </Rad>
          <Rad hoyre={<Text style={skrift.under}>{meg?.company.name}</Text>}>
            <Text style={skrift.kropp}>Selskap</Text>
          </Rad>
        </Gruppe>

        <Gruppe tittel="Utboks" hoyre={utboks.length ? `${n.venter + n.sender} venter · ${n.feil} feilet` : undefined}>
          {utboks.length === 0 ? (
            <Rad>
              <View style={s.altSendt}>
                <Ikon navn="checkmark-circle" storleik={22} farge={farge.positiv} />
                <Text style={skrift.kropp}>Alt er sendt.</Text>
              </View>
            </Rad>
          ) : (
            utboks
              .slice()
              .reverse()
              .map((r) => (
                <Rad
                  key={r.id}
                  onPress={() => setValgt(r)}
                  pil
                  hoyre={<Pille tekst={r.status === "feil" ? "Feilet" : r.status === "sender" ? "Sender" : "Venter"} tone={r.status === "feil" ? "roed" : "oransje"} />}
                >
                  <Text style={[skrift.liten, tabellTall]}>
                    {TYPE[r.type].tekst} · {ordreNr(r.ordre_id)} · {tid(r.laga_kl)}
                  </Text>
                  <Text style={skrift.overskrift} numberOfLines={1}>
                    {beskrivelse(r)}
                  </Text>
                  <Text style={[skrift.under, r.status === "feil" && s.feil]} numberOfLines={2}>
                    {statusTekst(r)}
                  </Text>
                </Rad>
              ))
          )}
        </Gruppe>
        {utboks.length ? <Text style={[skrift.liten, s.hjelp]}>Utboksen sender seg selv når du har dekning. Trykk på en rad for å prøve igjen eller slette den.</Text> : null}

        <View style={s.bunn}>
          <Knapp tekst="Logg ut" variant="sekundaer" stor onPress={spoerLoggUt} />
          <Text style={skrift.liten}>Devello Montør {Constants.expoConfig?.version ?? ""}</Text>
        </View>
      </ScrollView>

      <Sheet synlig={!!valgt} onLukk={() => setValgt(null)} tittel={valgt ? `${TYPE[valgt.type].tekst} · ${ordreNr(valgt.ordre_id)}` : ""} under={valgt ? tid(valgt.laga_kl) : ""}>
        {valgt ? (
          <>
            <Text style={skrift.kropp} numberOfLines={4}>
              {beskrivelse(valgt)}
            </Text>
            <Text style={[skrift.under, valgt.status === "feil" && s.feil]}>{statusTekst(valgt)}</Text>
            <View style={s.arkKnapper}>
              {valgt.status === "feil" ? (
                <Knapp
                  tekst="Prøv igjen"
                  stor
                  onPress={async () => {
                    const id = valgt.id;
                    setValgt(null);
                    await proevIgjen(id);
                    kjoer();
                  }}
                />
              ) : null}
              <Knapp
                tekst="Slett fra utboksen"
                variant="fare"
                stor
                onPress={async () => {
                  const id = valgt.id;
                  setValgt(null);
                  await slett(id);
                  kvitter("Slettet fra utboksen");
                }}
              />
              <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setValgt(null)} />
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 6, paddingBottom: 40, gap: 22 },
  profil: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  profilTekst: { flex: 1, gap: 2 },
  altSendt: { flexDirection: "row", alignItems: "center", gap: 10 },
  feil: { color: farge.negativ },
  hjelp: { marginTop: -12, paddingHorizontal: 4 },
  bunn: { marginTop: 8, gap: 14, alignItems: "center" },
  arkKnapper: { gap: 8 },
});
