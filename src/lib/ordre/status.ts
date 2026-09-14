import type { OrderStatus } from "@/lib/types";

/**
 * Lovlige statusoverganger.
 *
 * Framover: åpen → pågår → ferdig. Tilbake igjen ett steg om gangen, for
 * en jobb som ble merket ferdig for tidlig. Avbrutt fra alle — og fra
 * avbrutt kan man angre og åpne ordren igjen. Fakturert settes av
 * fakturasteget senere, aldri for hånd; en fakturert ordre hører til
 * faktureringen og røres ikke her.
 *
 * Én tabell, brukt av både API-et (som håndhever) og knappene på
 * ordresiden (som bare viser det som er lov). Da kan de ikke sprike.
 */
const OVERGANGER: Record<OrderStatus, OrderStatus[]> = {
  opna: ["paagaar", "avbrutt"],
  paagaar: ["ferdig", "opna", "avbrutt"],
  ferdig: ["paagaar", "avbrutt"],
  fakturert: [],
  avbrutt: ["opna"],
};

export function lovligeOverganger(fra: OrderStatus): OrderStatus[] {
  return OVERGANGER[fra] ?? [];
}

/** Knappeteksten for en overgang. «Start jobben», ikke «Sett status til pågår». */
export const OVERGANG_TEKST: Record<OrderStatus, string> = {
  opna: "Åpne igjen",
  paagaar: "Start jobben",
  ferdig: "Merk som ferdig",
  fakturert: "Fakturer",
  avbrutt: "Avbryt ordren",
};
