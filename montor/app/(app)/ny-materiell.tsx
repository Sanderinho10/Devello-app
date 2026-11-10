import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useErOffline } from "@/components/Offline";
import { Banner, Chip, Felt, Gruppe, Knapp, Laster, Rad, Sheet, Sokefelt, Stepper, Tom } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { advarsel as dunkAdvarsel, lagret as dunkLagret } from "@/lib/haptikk";
import { kroner, lesTall, mengde as fmtMengde } from "@/lib/format";
import { kvitter } from "@/lib/kvittering";
import { useMeg, useSok } from "@/lib/sporringar";
import { farge, marg, radius, skrift, tabellTall } from "@/lib/tema";
import type { SokTreff } from "@/lib/typer";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const ENHETER = ["stk", "m", "kg", "l"];

/**
 * Søk eller skann → treff → mengde → Legg til. Finnes ikke varen: fritekst.
 * Søket krever nett; fritekst virker alltid. Parameter: ordre.
 */
export default function NyMateriell() {
  const { ordre: ordreId = "" } = useLocalSearchParams<{ ordre: string }>();
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const meg = useMeg().data;
  const offline = useErOffline();

  const [tekst, setTekst] = useState("");
  const [sporring, setSporring] = useState("");
  const [skanner, setSkanner] = useState(false);
  const [skannet, setSkannet] = useState<string | null>(null);
  const [valgt, setValgt] = useState<SokTreff | null>(null);
  const [fritekst, setFritekst] = useState(false);
  const [feil, setFeil] = useState<string | null>(null);
  const [tillatelse, beOmTillatelse] = useCameraPermissions();

  // 300 ms debounce på det som skrives.
  useEffect(() => {
    const t = setTimeout(() => setSporring(tekst), 300);
    return () => clearTimeout(t);
  }, [tekst]);

  const sok = useSok(offline ? "" : sporring);
  const treff = useMemo(() => sok.data ?? [], [sok.data]);

  // Skann: ett treff går rett til mengde, flere → liste, ingen → fritekst-hint.
  // Avledet, ikke satt: så lenge søket er koden som ble skannet og gir ett treff, er det valgt.
  const skannetTreff = skannet && sporring === skannet && sok.isSuccess && treff.length === 1 ? treff[0] : null;
  const aktivtValg = valgt ?? skannetTreff;

  const startSkann = async () => {
    if (!tillatelse?.granted) {
      const svar = await beOmTillatelse();
      if (!svar.granted) {
        setFeil("Appen trenger tilgang til kameraet for å skanne. Slå det på i Innstillinger.");
        return;
      }
    }
    setFeil(null);
    setSkanner(true);
  };

  const paaSkann = (kode: string) => {
    dunkLagret();
    setSkanner(false);
    setValgt(null);
    setTekst(kode);
    setSporring(kode);
    setSkannet(kode);
  };

  const lukkMengde = () => {
    setValgt(null);
    setSkannet(null);
  };

  const leggTilFraKatalog = async (vare: SokTreff, mengde: number) => {
    const kost = vare.net_price_per_unit ?? vare.list_price_per_unit;
    await leggTil({
      ordre_id: ordreId,
      type: "materiell",
      payload: {
        supplier_item_id: vare.id,
        name: vare.name,
        unit: vare.unit,
        quantity: mengde,
        cost_price: kost,
        sale_price: meg ? Math.round(kost * (1 + meg.company.materials_markup_pct / 100) * 100) / 100 : null,
        note: null,
        item_no: vare.item_no,
        supplier_name: vare.supplier_name,
      },
    });
    kjoer();
    router.back();
    kvitter(`${fmtMengde(mengde, vare.unit)} lagt til`);
  };

  const leggTilFritekst = async (navn: string, mengde: number, enhet: string, kostpris: number | null) => {
    await leggTil({
      ordre_id: ordreId,
      type: "materiell",
      payload: {
        supplier_item_id: null,
        name: navn,
        unit: enhet,
        quantity: mengde,
        // API-et krever kostpris eller salgspris; uten pris sendes 0, og kontoret setter prisen.
        cost_price: kostpris ?? 0,
        sale_price: null,
        note: null,
        item_no: null,
        supplier_name: null,
      },
    });
    kjoer();
    router.back();
    kvitter(`${fmtMengde(mengde, enhet)} lagt til`);
  };

  if (skanner) {
    return (
      <View style={s.kamera}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }} onBarcodeScanned={(r) => paaSkann(r.data)} />
        <View style={s.ramme} pointerEvents="none" />
        <Text style={s.kameraTekst}>Hold strekkoden i rammen</Text>
        <View style={[s.kameraBunn, { paddingBottom: Math.max(inn.bottom, 16) }]}>
          <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setSkanner(false)} style={s.kameraKnapp} />
        </View>
      </View>
    );
  }

  if (fritekst) {
    return <Fritekst onLagre={leggTilFritekst} onAvbryt={() => setFritekst(false)} startNavn={/^\d+$/.test(tekst) ? "" : tekst} />;
  }

  const ingenTreff = sporring.trim().length >= 2 && sok.isSuccess && treff.length === 0;
  const tomt = sporring.trim().length < 2;

  return (
    <View style={s.fyll}>
      <View style={s.topp}>
        <View style={s.sokRad}>
          <View style={s.sokFelt}>
            <Sokefelt
              autoFocus
              placeholder="Navn, elnummer eller EAN"
              value={tekst}
              onChangeText={(t) => {
                setSkannet(null);
                setTekst(t);
              }}
            />
          </View>
          <Knapp tekst="Skann" ikon="barcode-outline" onPress={startSkann} />
        </View>
        {offline ? <Banner slag="advarsel" tekst="Søk krever nett — skriv varen inn i stedet." handling="Skriv inn" onHandling={() => setFritekst(true)} /> : null}
        {feil ? <Banner tekst={feil} /> : null}
        {sok.error ? <Banner tekst={feilTekst(sok.error)} /> : null}
      </View>

      {sok.isFetching && !treff.length ? (
        <Laster />
      ) : (
        <FlatList
          data={treff.length ? [treff] : []}
          keyExtractor={() => "treff"}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.liste}
          renderItem={({ item }) => (
            <Gruppe>
              {item.map((v) => (
                <Treff key={v.id} vare={v} onPress={() => setValgt(v)} />
              ))}
            </Gruppe>
          )}
          ListEmptyComponent={
            ingenTreff ? (
              <Tom ikon="search-outline" tekst="Fant ikke varen" under="Skriv den inn, så setter kontoret prisen." />
            ) : tomt && !offline ? (
              <Tom ikon="barcode-outline" tekst="Søk i katalogen" under="Skriv minst to tegn, eller skann strekkoden på varen." />
            ) : undefined
          }
          ListFooterComponent={<Knapp tekst={ingenTreff ? "Skriv varen inn" : "Fant du ikke varen? Skriv den inn"} variant={ingenTreff ? "primaer" : "lenke"} onPress={() => setFritekst(true)} style={s.fritekst} />}
        />
      )}

      <MengdeArk key={aktivtValg?.id ?? "ingen"} vare={aktivtValg} onLukk={lukkMengde} onLeggTil={leggTilFraKatalog} />
    </View>
  );
}

function Treff({ vare, onPress }: { vare: SokTreff; onPress: () => void }) {
  const kost = vare.net_price_per_unit ?? vare.list_price_per_unit;
  return (
    <Rad onPress={onPress} pil hoyre={<Text style={s.pris}>{kroner(kost, vare.unit)}</Text>}>
      <Text style={skrift.overskrift} numberOfLines={2}>
        {vare.name}
      </Text>
      <Text style={[skrift.under, tabellTall]}>
        {vare.item_no} · {vare.supplier_name}
        {vare.net_price_per_unit === null ? " · listepris" : ""}
      </Text>
    </Rad>
  );
}

function MengdeArk({ vare, onLukk, onLeggTil }: { vare: SokTreff | null; onLukk: () => void; onLeggTil: (v: SokTreff, mengde: number) => Promise<void> }) {
  // Nøkkelen på komponenten (vare-id) nullstiller mengden når en ny vare velges.
  const [mengde, setMengde] = useState(1);
  const [lagrer, setLagrer] = useState(false);
  const kost = vare ? (vare.net_price_per_unit ?? vare.list_price_per_unit) : 0;
  return (
    <Sheet synlig={!!vare} onLukk={onLukk} tittel={vare?.name} under={vare ? `${vare.item_no} · ${vare.supplier_name} · ${kroner(kost, vare.unit)}` : ""}>
      {vare ? (
        <>
          <Stepper verdi={mengde} onChange={setMengde} steg={1} enhet={vare.unit} />
          <Knapp
            tekst="Legg til"
            stor
            laster={lagrer}
            deaktivert={mengde <= 0}
            onPress={async () => {
              setLagrer(true);
              try {
                await onLeggTil(vare, mengde);
              } catch {
                dunkAdvarsel();
                setLagrer(false);
              }
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

function Fritekst({
  startNavn,
  onLagre,
  onAvbryt,
}: {
  startNavn: string;
  onLagre: (navn: string, mengde: number, enhet: string, kostpris: number | null) => Promise<void>;
  onAvbryt: () => void;
}) {
  const inn = useSafeAreaInsets();
  const [navn, setNavn] = useState(startNavn);
  const [mengde, setMengde] = useState(1);
  const [enhet, setEnhet] = useState("stk");
  const [pris, setPris] = useState("");
  const [feil, setFeil] = useState<string | null>(null);
  const [lagrer, setLagrer] = useState(false);

  const lagre = async () => {
    if (!navn.trim()) return setFeil("Skriv hva varen er.");
    if (mengde <= 0) return setFeil("Mengden må være større enn 0.");
    const kost = pris.trim() ? lesTall(pris) : null;
    if (pris.trim() && kost === null) return setFeil("Prisen må være et tall.");
    setLagrer(true);
    try {
      await onLagre(navn.trim(), mengde, enhet, kost);
    } catch (e) {
      setFeil(e instanceof Error ? e.message : "Kunne ikke lagre.");
      setLagrer(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {feil ? <Banner tekst={feil} /> : null}
        <Felt etikett="Vare" autoFocus value={navn} onChangeText={setNavn} placeholder="F.eks. Diverse festemateriell" />
        <View style={s.del}>
          <Text style={skrift.etikett}>Mengde</Text>
          <View style={s.tallKort}>
            <Stepper verdi={mengde} onChange={setMengde} steg={1} enhet={enhet} />
            <View style={s.enheter}>
              {ENHETER.map((e) => (
                <View key={e} style={s.enhet}>
                  <Chip tekst={e} valgt={enhet === e} onPress={() => setEnhet(e)} />
                </View>
              ))}
            </View>
          </View>
        </View>
        <Felt etikett="Kostpris per enhet (valgfritt)" value={pris} onChangeText={setPris} keyboardType="decimal-pad" placeholder="kr" />
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Legg til" stor onPress={lagre} laster={lagrer} />
        <Knapp tekst="Tilbake til søk" variant="lenke" onPress={onAvbryt} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  topp: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 6, gap: 10 },
  sokRad: { flexDirection: "row", gap: 8, alignItems: "center" },
  sokFelt: { flex: 1 },
  liste: { paddingHorizontal: marg, paddingTop: 6, paddingBottom: 32, gap: 8 },
  pris: { fontSize: 15, fontWeight: "500", color: farge.tekstSekundaer, ...tabellTall },
  fritekst: { marginTop: 8, alignSelf: "center" },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 24, gap: 20 },
  del: { gap: 8 },
  tallKort: { backgroundColor: farge.flate, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: farge.kant, padding: 14, gap: 14 },
  enheter: { flexDirection: "row", gap: 8 },
  enhet: { flex: 1 },
  bunn: { paddingHorizontal: marg, paddingTop: 10, gap: 2, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kantSterk },
  kamera: { flex: 1, backgroundColor: "#000", justifyContent: "flex-end" },
  ramme: { position: "absolute", top: "28%", left: "8%", right: "8%", height: 170, borderWidth: 3, borderColor: farge.hvit, borderRadius: radius.xl },
  kameraTekst: { position: "absolute", top: "28%", left: 0, right: 0, marginTop: 188, textAlign: "center", color: farge.hvit, fontSize: 17, fontWeight: "600" },
  kameraBunn: { padding: marg },
  kameraKnapp: { backgroundColor: "rgba(255,255,255,0.92)" },
});
