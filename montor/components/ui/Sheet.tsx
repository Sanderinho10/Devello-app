import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { farge, radius, skrift } from "@/lib/tema";

interface Props {
  synlig: boolean;
  onLukk: () => void;
  tittel?: string;
  children: ReactNode;
}

/** Ark fra bunnen — mengdevalg, datovalg, slette-valg. Trykk utenfor lukker. */
export function Sheet({ synlig, onLukk, tittel, children }: Props) {
  const inn = useSafeAreaInsets();
  return (
    <Modal visible={synlig} transparent animationType="slide" onRequestClose={onLukk}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.fyll}>
        <Pressable style={s.bak} onPress={onLukk} accessibilityLabel="Lukk" />
        <View style={[s.ark, { paddingBottom: Math.max(inn.bottom, 16) }]}>
          <View style={s.haandtak} />
          {tittel ? <Text style={s.tittel}>{tittel}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  fyll: { flex: 1, justifyContent: "flex-end" },
  bak: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  ark: {
    backgroundColor: farge.flate,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },
  haandtak: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: farge.kantSterk, marginBottom: 4 },
  tittel: { fontSize: skrift.tittel, fontWeight: "700", color: farge.tekst },
});
