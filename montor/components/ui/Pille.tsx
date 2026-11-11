import { StyleSheet, Text, View } from "react-native";
import { farge, radius } from "@/lib/tema";
import type { OrderStatus } from "@/lib/typer";
import type { UtboksRad } from "@/lib/utboks/typer";

type Tone = "noytral" | "blaa" | "oransje" | "groenn" | "groennFylt" | "roed" | "lilla";

const TONER: Record<Tone, { bak: string; tekst: string }> = {
  noytral: { bak: "rgba(0, 0, 0, 0.05)", tekst: farge.tekstSekundaer },
  blaa: { bak: farge.aksentMyk, tekst: farge.aksent },
  oransje: { bak: farge.advarselMyk, tekst: farge.advarsel },
  groenn: { bak: farge.positivMyk, tekst: farge.positiv },
  groennFylt: { bak: farge.positiv, tekst: farge.hvit },
  roed: { bak: farge.negativMyk, tekst: farge.negativ },
  lilla: { bak: farge.moteMyk, tekst: farge.mote },
};

/** Liten kapsel med et ord i — .pill i nettappen. */
export function Pille({ tekst, tone = "noytral" }: { tekst: string; tone?: Tone }) {
  const t = TONER[tone];
  return (
    <View style={[s.pille, { backgroundColor: t.bak }]}>
      <Text style={[s.tekst, { color: t.tekst }]} numberOfLines={1}>
        {tekst}
      </Text>
    </View>
  );
}

const STATUS: Record<OrderStatus, { tekst: string; tone: Tone }> = {
  opna: { tekst: "Åpen", tone: "blaa" },
  paagaar: { tekst: "Pågår", tone: "oransje" },
  ferdig: { tekst: "Ferdig", tone: "groenn" },
  fakturert: { tekst: "Fakturert", tone: "groennFylt" },
  avbrutt: { tekst: "Avbrutt", tone: "noytral" },
};

/** Ordrestatus med de samme fargene som nettappen. */
export function StatusPille({ status }: { status: OrderStatus }) {
  const st = STATUS[status] ?? STATUS.avbrutt;
  return <Pille tekst={st.tekst} tone={st.tone} />;
}

/** «Sendes …» eller «Feilet» på rader som ligger i utboksen. */
export function UtboksMerke({ rad }: { rad: UtboksRad | undefined }) {
  if (!rad) return null;
  return rad.status === "feil" ? <Pille tekst="Feilet" tone="roed" /> : <Pille tekst="Sendes …" tone="oransje" />;
}

const s = StyleSheet.create({
  pille: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.kapsel, alignSelf: "flex-start" },
  tekst: { fontSize: 12, fontWeight: "600" },
});
