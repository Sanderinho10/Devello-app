import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Søket i listene (tilbud, ordre). Ett søkeord, som i POGO: det treffer på
 * tekstfeltene, og er det et tall, også på nummeret (tilbuds-, ordre- eller
 * kundenummer).
 */

export function lesSokeord(verdi: string | undefined): string {
  return (verdi ?? "").trim().slice(0, 100);
}

/** ILIKE-mønster. PostgREST-filteret skiller på komma og parenteser, så de tas bort. */
export function likeMonster(q: string): string {
  return `%${q.replace(/[%_,()*]/g, " ")}%`;
}

export function erHeltall(q: string): boolean {
  return /^\d{1,9}$/.test(q);
}

/** «id.in.(a,b)», eller ingenting når lista er tom. */
export function iListe(kolonne: string, ider: string[]): string[] {
  return ider.length ? [`${kolonne}.in.(${ider.join(",")})`] : [];
}

/**
 * Kundene i registeret som passer søket: på navn, eller på kundenummer når
 * søket er et tall. Brukes til å finne tilbud og ordrer via customer_id.
 */
export async function kunderSomPasser(supabase: SupabaseClient, q: string): Promise<string[]> {
  const monster = likeMonster(q);
  const filter = [`name.ilike.${monster}`, ...(erHeltall(q) ? [`customer_no.eq.${q}`] : [])].join(",");
  const { data } = await supabase.from("customers").select("id").or(filter).limit(200);
  return (data ?? []).map((k) => k.id as string);
}
