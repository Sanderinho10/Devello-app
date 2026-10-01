import { useRouter } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Chip, Felt, Knapp, Sheet, Stepper } from "@/components/ui";
import { isoDato, kortDato } from "@/lib/format";
import { useMeg } from "@/lib/sporringar";
import { farge, skrift, trykk } from "@/lib/tema";
import { lesSist, noterBrukt, sorterEtterSist } from "@/lib/timetypeSist";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const HURTIG = [1, 2, 4, 7.5];
const UKEDAG = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];

/**
 * Ny timeføring på under ti sekunder: dato → timetype → timer → notat → Lagre.
 * Alt havner i utboksen; raden vises i lista med en gang.
 */
export default function NyTime() {
  const id = useOrdreId();
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const meg = useMeg().data;

  const iDag = useMemo(() => new Date(), []);
  const iGaar = useMemo(() => {
    const d = new Date(iDag);
    d.setDate(d.getDate() - 1);
    return d;
  }, [iDag]);

  const [datoValgt, setDato] = useState<Date>(iDag);
  const [velgerDato, setVelgerDato] = useState(false);
  const [valgtTimetypeId, setTimetypeId] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [notat, setNotat] = useState("");
  const [sist, setSist] = useState<string[]>([]);
  const [feil, setFeil] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);

  useEffect(() => {
    if (meg) lesSist(meg.user.id).then(setSist);
  }, [meg]);

  const timetyper = useMemo(() => sorterEtterSist(meg?.timetyper ?? [], sist), [meg, sist]);

  // Sist brukte (eller første) er valgt til montøren trykker på en annen.
  const timetypeId = valgtTimetypeId ?? timetyper[0]?.id ?? null;

  const erIDag = isoDato(datoValgt) === isoDato(iDag);
  const erIGaar = isoDato(datoValgt) === isoDato(iGaar);

  const lagre = async () => {
    const timetype = timetyper.find((t) => t.id === timetypeId);
    if (!timetype) {
      setFeil("Velg en timetype.");
      return;
    }
    if (timer <= 0 || timer > 24) {
      setFeil("Timer må være mellom 0 og 24.");
      return;
    }
    setLagrer(true);
    try {
      await leggTil({
        ordre_id: id,
        type: "time",
        payload: {
          work_date: isoDato(datoValgt),
          price_item_id: timetype.id,
          hours: timer,
          note: notat.trim() || null,
          time_type_name: timetype.name,
          unit_price: timetype.unit_price,
        },
      });
      if (meg) noterBrukt(meg.user.id, timetype.id);
      kjoer();
      router.back();
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke lagre.");
      setLagrer(false);
    }
  };

  const sisteDager = useMemo(() => {
    const ut: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(iDag);
      d.setDate(d.getDate() - i);
      ut.push(d);
    }
    return ut;
  }, [iDag]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {feil ? <Banner tekst={feil} /> : null}

        <Text style={s.etikett}>Dato</Text>
        <View style={s.chips}>
          <Chip tekst="I dag" valgt={erIDag} onPress={() => setDato(iDag)} />
          <Chip tekst="I går" valgt={erIGaar} onPress={() => setDato(iGaar)} />
          <Chip tekst={erIDag || erIGaar ? "Annen dag" : kortDato(datoValgt)} valgt={!erIDag && !erIGaar} onPress={() => setVelgerDato(true)} />
        </View>

        <Text style={s.etikett}>Timetype</Text>
        {timetyper.length ? (
          <View style={s.chips}>
            {timetyper.map((t) => (
              <Chip key={t.id} tekst={t.name} stor valgt={t.id === timetypeId} onPress={() => setTimetypeId(t.id)} />
            ))}
          </View>
        ) : (
          <Banner slag="advarsel" tekst="Selskapet har ingen timetyper i timeprislisten. Kontoret må legge inn en." />
        )}

        <Text style={s.etikett}>Timer</Text>
        <Stepper verdi={timer} onChange={setTimer} steg={0.5} enhet="t" />
        <View style={s.chips}>
          {HURTIG.map((h) => (
            <Chip key={h} tekst={String(h).replace(".", ",")} valgt={timer === h} onPress={() => setTimer(h)} />
          ))}
        </View>

        <Felt etikett="Notat (valgfritt)" value={notat} onChangeText={setNotat} placeholder="Hva ble gjort" multiline />
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Lagre" stor onPress={lagre} laster={lagrer} deaktivert={!timetyper.length} />
      </View>

      <Sheet synlig={velgerDato} onLukk={() => setVelgerDato(false)} tittel="Velg dag">
        <ScrollView style={s.dagListe}>
          {sisteDager.map((d) => {
            const valgt = isoDato(d) === isoDato(datoValgt);
            return (
              <Pressable
                key={isoDato(d)}
                onPress={() => {
                  setDato(d);
                  setVelgerDato(false);
                }}
                style={[s.dagRad, valgt && s.dagValgt]}
              >
                <Text style={[s.dagTekst, valgt && s.dagValgtTekst]}>
                  {UKEDAG[d.getDay()]} {kortDato(d)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { padding: 16, gap: 12, paddingBottom: 24 },
  etikett: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bunn: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kant },
  dagListe: { maxHeight: 420 },
  dagRad: { minHeight: trykk.minste, justifyContent: "center", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: farge.kant },
  dagValgt: { backgroundColor: farge.aksentMyk },
  dagTekst: { fontSize: skrift.stor, color: farge.tekst },
  dagValgtTekst: { color: farge.aksent, fontWeight: "700" },
});
