import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { farge } from "@/lib/tema";

export type IkonNavn = ComponentProps<typeof Ionicons>["name"];

/** Ikon fra Ionicons — samme strekstil som iOS. Står alltid sammen med tekst, aldri alene som knapp. */
export function Ikon({ navn, storleik = 20, farge: f = farge.tekstSekundaer }: { navn: IkonNavn; storleik?: number; farge?: string }) {
  return <Ionicons name={navn} size={storleik} color={f} />;
}
