import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, Chip, Felt, Knapp } from "@/components/ui";
import { api, feilTekst } from "@/lib/api";
import { kvitter } from "@/lib/kvittering";
import { farge, marg, skrift } from "@/lib/tema";

type Type = "onske" | "feil" | "annet";

const TYPER: { verdi: Type; tekst: string }[] = [
  { verdi: "onske", tekst: "Ønske eller idé" },
  { verdi: "feil", tekst: "Noe virker ikke" },
  { verdi: "annet", tekst: "Annet" },
];

const MAKS_LENGDE = 5000;

/**
 * «Gi tilbakemelding» — samme skjema og samme mottak som i nettappen
 * (POST /api/tilbakemelding). Går rett til Devello, med montøren som
 * svar-til.
 *
 * Sendes med en gang og ikke gjennom utboksen: serveren har ingen
 * client_id å deduplisere på her, og en melding som feiler skal montøren
 * se mens teksten ennå står i feltet.
 */
export default function Tilbakemelding() {
  const router = useRouter();
  const inn = useSafeAreaInsets();
  const [type, setType] = useState<Type>("onske");
  const [melding, setMelding] = useState("");
  const [feil, setFeil] = useState<string | null>(null);
  const [sender, setSender] = useState(false);

  const send = async () => {
    setSender(true);
    setFeil(null);
    try {
      await api("/api/tilbakemelding", {
        method: "POST",
        // «side» er der meldingen kom fra — i nettappen stien, her appen og versjonen.
        body: { type, melding: melding.trim(), side: `Montørappen ${Constants.expoConfig?.version ?? ""} (${Platform.OS})`.replace("  ", " ") },
      });
      router.back();
      kvitter("Takk! Tilbakemeldingen er sendt");
    } catch (e) {
      setFeil(feilTekst(e) === "Ingen dekning" ? "Ingen dekning — prøv igjen når du har nett. Teksten står her så lenge." : feilTekst(e));
      setSender(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={s.fyll}>
      <ScrollView contentContainerStyle={s.innhold} keyboardShouldPersistTaps="handled">
        <Text style={skrift.under}>Noe som ikke virker, noe som mangler, eller noe du liker? Det går rett til oss, og vi svarer på e-post.</Text>
        {feil ? <Banner tekst={feil} /> : null}

        <View style={s.del}>
          <Text style={skrift.etikett}>Hva gjelder det?</Text>
          <View style={s.chips}>
            {TYPER.map((t) => (
              <Chip key={t.verdi} tekst={t.tekst} valgt={t.verdi === type} onPress={() => setType(t.verdi)} />
            ))}
          </View>
        </View>

        <Felt
          etikett="Melding"
          autoFocus
          multiline
          maxLength={MAKS_LENGDE}
          value={melding}
          onChangeText={setMelding}
          placeholder={type === "feil" ? "Hva gjorde du, og hva skjedde?" : "Skriv fritt …"}
          style={s.tekstfelt}
        />
      </ScrollView>
      <View style={[s.bunn, { paddingBottom: Math.max(inn.bottom, 12) }]}>
        <Knapp tekst="Send" stor onPress={send} laster={sender} deaktivert={!melding.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, backgroundColor: farge.bakgrunn },
  innhold: { paddingHorizontal: marg, paddingTop: 8, paddingBottom: 24, gap: 20 },
  del: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tekstfelt: { minHeight: 150 },
  bunn: { paddingHorizontal: marg, paddingTop: 10, backgroundColor: farge.bakgrunn, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: farge.kantSterk },
});
