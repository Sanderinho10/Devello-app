import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Timetype } from "./typer";

/** Sist brukte timetyper først — per bruker, i AsyncStorage. */

const NOKKEL = (brukerId: string) => `timetype-sist:${brukerId}`;

export async function lesSist(brukerId: string): Promise<string[]> {
  try {
    const s = await AsyncStorage.getItem(NOKKEL(brukerId));
    return s ? (JSON.parse(s) as string[]) : [];
  } catch {
    return [];
  }
}

export async function noterBrukt(brukerId: string, timetypeId: string): Promise<void> {
  const sist = await lesSist(brukerId);
  const ny = [timetypeId, ...sist.filter((id) => id !== timetypeId)].slice(0, 10);
  await AsyncStorage.setItem(NOKKEL(brukerId), JSON.stringify(ny));
}

/** Timetypene sortert: sist brukte først, resten som serveren ga dem. */
export function sorterEtterSist(timetyper: Timetype[], sist: string[]): Timetype[] {
  const plass = new Map(sist.map((id, i) => [id, i]));
  return [...timetyper].sort((a, b) => (plass.get(a.id) ?? 999) - (plass.get(b.id) ?? 999));
}
