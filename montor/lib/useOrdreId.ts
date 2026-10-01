import { useGlobalSearchParams, useLocalSearchParams } from "expo-router";

/**
 * Ordre-ID-en fra [id]-segmentet, uansett hvor dypt skjermen ligger.
 *
 * Lokale parametre følger med når man navigerer via sti, men ikke når en
 * nøstet navigator bytter skjerm ved navn. Da redder de globale (fra URL-en).
 */
export function useOrdreId(): string {
  const lokal = useLocalSearchParams<{ id?: string }>();
  const global = useGlobalSearchParams<{ id?: string }>();
  const id = lokal.id ?? global.id ?? "";
  return Array.isArray(id) ? (id[0] ?? "") : id;
}
