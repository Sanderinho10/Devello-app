import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Chip, Felt, Gruppe, Knapp, Rad, Sheet, Stepper } from "@/components/ui";
import { fraIsoDato, isoDato, kortDato, tall } from "@/lib/format";
import { kvitter } from "@/lib/kvittering";
import { useMeg, useOrdrar, useOrdre } from "@/lib/sporringar";
import { farge, marg, skrift, tabellTall } from "@/lib/tema";
import { lesSist, noterBrukt, sorterEtterSist } from "@/lib/timetypeSist";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const HURTIG = [1, 2, 4, 7.5];
const UKEDAG = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];

/**
 * Ny timeføring på under ti sekunder: dato → timetype → timer → notat → Lagre.
 * Alt havner i utboksen; raden vises i lista med en gang.
 *
 * Parametre: ordre (påkrevd), og fra et timeforslag i programmet også
 * dato, timar og timetype — da er skjemaet ferdig utfylt.
 */
export default function NyTime() {
  const p = useLocalSearchParams<{ ordre: string; dato?: string; timar?: string; timetype?: string }>();
  const ordreId = p.ordre ?? "";
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const meg = useMeg().data;
  const iListe = useOrdrar().data?.find((o) => o.id === ordreId);
  const ordre = useOrdre(ordreId).data?.ordre;
  const ordreTekst = iListe ?? ordre;

  const iDag = useMemo(() => new Date(), []);
  const iGaar = useMemo(() => {
    const d = new Date(iDag);
    d.setDate(d.getDate() - 1);
    return d;
  }, [iDag]);

  const [datoValgt, setDato] = useState<Date>(() => (p.dato && fraIsoDato(p.dato)) || iDag);
  const [velgerDato, setVelgerDato] = useState(false);
  const [valgtTimetypeId, setTimetypeId] = useState<string | null>(p.timetype || null);
  const [timer, setTimer] = useState(() => {
    const n = p.timar ? Number(p.timar) : 0;
    return Number.isFinite(n) && n > 0 && n <= 24 ? n : 0;
  });
  const [notat, setNotat] = useState("");
  const [sist, setSist] = useState<string[]>([]);
  const [feil, setFeil] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);

  useEffect(() => {
    if (meg) lesSist(meg.user.id).then(setSist);
  }, [meg]);

  const timetyper = useMemo(() => sorterEtterSist(meg?.timetyper ?? [], sist), [meg, sist]);
  // Sist brukte (eller første) er valgt til montøren trykker på en annen.
  const timetypeId = timetyper.some((t) => t.id === valgtTimetypeId) ? valgtTimetypeId : (timetyper[0]?.id ?? null);

  const erIDag = isoDato(datoValgt) === isoDato(iDag);
  const erIGaar = isoDato(datoValgt) === isoDato(iGaar);

  const lagre = async () => {
    const timetype = timetyper.find((t) => t.id === timetypeId);
    if (!timetype) return setFeil("Velg en timetype.");
    if (timer <= 0) return setFeil("Velg hvor mange timer — bruk + eller et av hurtigvalgene.");
    if (timer > 24) return setFeil("Timer må være mellom 0 og 24.");
    setLagrer(true);
    try {
      await leggTil({
        ordre_id: ordreId,
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
      kvitter(`${tall(timer)} t lagret`);
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {ordreTekst ? (
          <Text style={[skrift.under, tabellTall]} numberOfLines={1}>
            #{ordreTekst.order_no} · {ordreTekst.title}
          </Text>
        ) : null}
        {feil ? <Banner tekst={feil} /> : null}

        <View style={s.del}>
          <Text style={skrift.etikett}>Dato</Text>
          <View style={s.chips}>
            <Chip tekst="I dag" valgt={erIDag} onPress={() => setDato(iDag)} />
            <Chip tekst="I går" valgt={erIGaar} onPress={() => setDato(iGaar)} />
            <Chip tekst={erIDag || erIGaar ? "Annen dag" : kortDato(datoValgt)} valgt={!erIDag && !erIGaar} onPress={() => setVelgerDato(true)} />
          </View>
        </View>

        <View style={s.del}>
          <Text style={skrift.etikett}>Timetype</Text>
          {timetyper.length ? (
            <View style={s.chips}>
              {timetyper.map((t) => (
                <Chip key={t.id} tekst={t.name} valgt={t.id === timetypeId} onPress={() => setTimetypeId(t.id)} />
              ))}
            </View>
          ) : (
            <Banner slag="info" tekst="Selskapet har ingen timetyper i timeprislisten. Kontoret må legge inn en." />
          )}
        </View>

        <View style={s.del}>
          <Text style={skrift.etikett}>Timer</Text>
          <View style={s.tallKort}>
            <Stepper verdi={timer} onChange={setTimer} steg={0.5} enhet="t" />
            <View style={s.hurtig}>
              {HURTIG.map((h) => (
                <View key={h} style={s.hurtigChip}>
                  <Chip tekst={tall(h)} valgt={timer === h} onPress={() => setTimer(h)} />
                </View>
              ))}
            </View>
          </View>
        </View>

        <Felt etikett="Notat (valgfritt)" value={notat} onChangeText={setNotat} placeholder="Hva ble gjort" multiline style={s.notat} />
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Lagre" stor onPress={lagre} laster={lagrer} deaktivert={!timetyper.length} />
      </View>

      <Sheet synlig={velgerDato} onLukk={() => setVelgerDato(false)} tittel="Velg dag">
        <ScrollView style={s.dagListe}>
          <Gruppe>
            {sisteDager.map((d) => {
              const valgt = isoDato(d) === isoDato(datoValgt);
              return (
                <Rad
                  key={isoDato(d)}
                  onPress={() => {
                    setDato(d);
                    setVelgerDato(false);
                  }}
                  hoyre={valgt ? <Text style={s.valgt}>Valgt</Text> : undefined}
                >
                  <Text style={[skrift.kropp, valgt && s.valgtTekst]}>
                    {UKEDAG[d.getDay()]} {kortDato(d)}
                  </Text>
                </Rad>
              );
            })}
          </Gruppe>
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 24, gap: 20 },
  del: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tallKort: { backgroundColor: farge.flate, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: farge.kant, padding: 14, gap: 14 },
  hurtig: { flexDirection: "row", gap: 8 },
  hurtigChip: { flex: 1 },
  notat: { minHeight: 88 },
  bunn: { paddingHorizontal: marg, paddingTop: 10, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kantSterk },
  dagListe: { maxHeight: 420 },
  valgt: { fontSize: 15, fontWeight: "600", color: farge.aksent },
  valgtTekst: { color: farge.aksent, fontWeight: "600" },
});
