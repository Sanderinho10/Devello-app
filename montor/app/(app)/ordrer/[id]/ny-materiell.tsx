import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useOrdreId } from "@/lib/useOrdreId";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useErOffline } from "@/components/Offline";
import { Banner, Chip, Felt, Knapp, Kort, Laster, Sheet, Stepper } from "@/components/ui";
import { feilTekst } from "@/lib/api";
import { kroner, lesTall } from "@/lib/format";
import { useMeg, useSok } from "@/lib/sporringar";
import { farge, radius, skrift, tabellTall, trykk } from "@/lib/tema";
import type { SokTreff } from "@/lib/typer";
import { leggTil } from "@/lib/utboks/db";
import { kjoer } from "@/lib/utboks/motor";

const ENHETER = ["stk", "m", "kg", "l"];

/**
 * Søk eller skann → treff → mengde → Legg til. Finnes ikke varen: fritekst.
 * Søket krever nett; fritekst virker alltid.
 */
export default function NyMateriell() {
  const id = useOrdreId();
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
  const feltRef = useRef<TextInput>(null);
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
      ordre_id: id,
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
  };

  const leggTilFritekst = async (navn: string, mengde: number, enhet: string, kostpris: number | null) => {
    await leggTil({
      ordre_id: id,
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
  };

  if (skanner) {
    return (
      <View style={s.kamera}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8"] }}
          onBarcodeScanned={(r) => paaSkann(r.data)}
        />
        <View style={s.ramme} pointerEvents="none" />
        <Text style={s.kameraTekst}>Hold strekkoden i rammen</Text>
        <View style={[s.kameraBunn, { paddingBottom: Math.max(inn.bottom, 16) }]}>
          <Knapp tekst="Avbryt" variant="sekundaer" stor onPress={() => setSkanner(false)} />
        </View>
      </View>
    );
  }

  if (fritekst) {
    return <Fritekst onLagre={leggTilFritekst} onAvbryt={() => setFritekst(false)} startNavn={/^\d+$/.test(tekst) ? "" : tekst} />;
  }

  const ingenTreff = sporring.length >= 2 && sok.isSuccess && treff.length === 0;

  return (
    <View style={s.fyll}>
      <View style={s.topp}>
        <View style={s.sokRad}>
          <View style={s.sokFelt}>
            <Felt
              ref={feltRef}
              autoFocus
              placeholder="Søk på navn, elnummer eller EAN"
              value={tekst}
              onChangeText={(t) => {
                setSkannet(null);
                setTekst(t);
              }}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable accessibilityRole="button" onPress={startSkann} style={({ pressed }) => [s.skann, pressed && s.trykket]}>
            <Text style={s.skannTekst}>Skann</Text>
          </Pressable>
        </View>
        {offline ? <Banner slag="advarsel" tekst="Søk krever nett — fritekst virker." /> : null}
        {feil ? <Banner tekst={feil} /> : null}
        {sok.error ? <Banner tekst={feilTekst(sok.error)} /> : null}
        {ingenTreff ? <Banner slag="info" tekst="Fant ikke varen — skriv den inn" handling="Skriv inn" onHandling={() => setFritekst(true)} /> : null}
      </View>

      {sok.isFetching && !treff.length ? (
        <Laster />
      ) : (
        <FlatList
          data={treff}
          keyExtractor={(v) => v.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.liste}
          renderItem={({ item }) => <Treff vare={item} paaslag={meg?.company.materials_markup_pct ?? 0} onPress={() => setValgt(item)} />}
          ListFooterComponent={
            <Pressable onPress={() => setFritekst(true)} style={s.fritekstLenke}>
              <Text style={s.fritekstTekst}>Fant du ikke varen? Skriv den inn</Text>
            </Pressable>
          }
        />
      )}

      <MengdeArk key={aktivtValg?.id ?? "ingen"} vare={aktivtValg} onLukk={lukkMengde} onLeggTil={leggTilFraKatalog} />
    </View>
  );
}

function Treff({ vare, paaslag, onPress }: { vare: SokTreff; paaslag: number; onPress: () => void }) {
  const kost = vare.net_price_per_unit ?? vare.list_price_per_unit;
  return (
    <Kort onPress={onPress}>
      <Text style={s.grossist}>{vare.supplier_name}</Text>
      <Text style={s.varenavn} numberOfLines={2}>
        <Text style={s.elnr}>{vare.item_no}</Text> · {vare.name}
      </Text>
      <View style={s.rad}>
        <Text style={s.enhet}>per {vare.unit}</Text>
        <Text style={s.pris}>
          {kroner(kost, vare.unit)}
          {vare.net_price_per_unit === null ? " (liste)" : ""}
        </Text>
      </View>
      {paaslag ? <Text style={s.salg}>Salg {kroner(kost * (1 + paaslag / 100), vare.unit)}</Text> : null}
    </Kort>
  );
}

function MengdeArk({ vare, onLukk, onLeggTil }: { vare: SokTreff | null; onLukk: () => void; onLeggTil: (v: SokTreff, mengde: number) => Promise<void> }) {
  // Nøkkelen på komponenten (vare-id) nullstiller mengden når en ny vare velges.
  const [mengde, setMengde] = useState(1);
  const [lagrer, setLagrer] = useState(false);
  return (
    <Sheet synlig={!!vare} onLukk={onLukk} tittel={vare?.name}>
      {vare ? (
        <>
          <Text style={s.arkUnder}>
            {vare.item_no} · {vare.supplier_name}
          </Text>
          <Stepper verdi={mengde} onChange={setMengde} steg={1} enhet={vare.unit} />
          <Knapp
            tekst="Legg til"
            stor
            laster={lagrer}
            deaktivert={mengde <= 0}
            onPress={async () => {
              setLagrer(true);
              await onLeggTil(vare, mengde);
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
    if (!navn.trim()) {
      setFeil("Skriv hva varen er.");
      return;
    }
    if (mengde <= 0) {
      setFeil("Mengden må være større enn 0.");
      return;
    }
    const kost = pris.trim() ? lesTall(pris) : null;
    if (pris.trim() && kost === null) {
      setFeil("Prisen må være et tall.");
      return;
    }
    setLagrer(true);
    await onLagre(navn.trim(), mengde, enhet, kost);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        {feil ? <Banner tekst={feil} /> : null}
        <Felt etikett="Vare" autoFocus value={navn} onChangeText={setNavn} placeholder="F.eks. Diverse festemateriell" />
        <Text style={s.etikett}>Mengde</Text>
        <Stepper verdi={mengde} onChange={setMengde} steg={1} enhet={enhet} />
        <View style={s.chips}>
          {ENHETER.map((e) => (
            <Chip key={e} tekst={e} valgt={enhet === e} onPress={() => setEnhet(e)} />
          ))}
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
  topp: { padding: 16, gap: 10 },
  sokRad: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  sokFelt: { flex: 1 },
  skann: { minHeight: trykk.minste, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: farge.aksent, alignItems: "center", justifyContent: "center" },
  trykket: { opacity: 0.8 },
  skannTekst: { color: farge.hvit, fontSize: skrift.normal, fontWeight: "700" },
  liste: { paddingHorizontal: 16, gap: 10, paddingBottom: 32 },
  grossist: { fontSize: skrift.liten, color: farge.tekstSekundaer },
  varenavn: { fontSize: skrift.normal, fontWeight: "600", color: farge.tekst, marginTop: 2 },
  elnr: { color: farge.tekstSekundaer, ...tabellTall },
  rad: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  enhet: { fontSize: skrift.liten, color: farge.tekstSekundaer },
  pris: { fontSize: skrift.normal, fontWeight: "600", color: farge.tekst, ...tabellTall },
  salg: { fontSize: skrift.liten, color: farge.tekstSekundaer, marginTop: 2, ...tabellTall },
  fritekstLenke: { minHeight: trykk.primaer, alignItems: "center", justifyContent: "center", marginTop: 8 },
  fritekstTekst: { fontSize: skrift.normal, fontWeight: "600", color: farge.aksent },
  arkUnder: { fontSize: skrift.normal, color: farge.tekstSekundaer, marginTop: -8 },
  innhold: { padding: 16, gap: 12 },
  etikett: { fontSize: skrift.liten, fontWeight: "600", color: farge.tekstSekundaer, textTransform: "uppercase", letterSpacing: 0.4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bunn: { paddingHorizontal: 16, paddingTop: 10, gap: 4, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kant },
  kamera: { flex: 1, backgroundColor: "#000", justifyContent: "flex-end" },
  ramme: { position: "absolute", top: "30%", left: "10%", right: "10%", height: 160, borderWidth: 3, borderColor: farge.hvit, borderRadius: radius.md },
  kameraTekst: { position: "absolute", top: "30%", left: 0, right: 0, marginTop: 176, textAlign: "center", color: farge.hvit, fontSize: skrift.stor, fontWeight: "600" },
  kameraBunn: { padding: 16 },
});
