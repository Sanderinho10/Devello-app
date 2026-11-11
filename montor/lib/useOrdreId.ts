import { useGlobalSearchParams, useLocalSearchParams } from "expo-router";

/**
 * Ordre-ID-en fra [id]-segmentet, for fanene på ordren (Timer, Materiell,
 * Notater).
 *
 * Lokale parametre følger med når man navigerer via sti, men ikke når
 * fanene bytter skjerm ved navn. Da redder de globale (fra URL-en).
 * Skjemaene (ny-time m.fl.) får ordren som egen parameter i stedet.
 */
export function useOrdreId(): string {
  const lokal = useLocalSearchParams<{ id?: string }>();
  const global = useGlobalSearchParams<{ id?: string }>();
  const id = lokal.id ?? global.id ?? "";
  return Array.isArray(id) ? (id[0] ?? "") : id;
}
