import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Partnerkoder blir lest opp på telefon og skrevet av for hånd.
 *
 * Derfor uten I, O, 0 og 1 — de forveksles i alle skrifttyper, og en kode som
 * ikke lar seg diktere er ubrukelig for en regnskapsfører som skal gi den
 * videre til en kunde.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

function candidate(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `DEV-${code}`;
}

/**
 * Trekker en kode som ikke er i bruk.
 *
 * Kolonnen er unik, så et sammenstøt ville uansett blitt avvist av databasen —
 * men da hadde regnskapsføreren fått en feilmelding i stedet for en konto.
 */
export async function generatePartnerCode(
  admin: SupabaseClient,
  attempts = 8,
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const code = candidate();
    const { data } = await admin
      .from("partners")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Klarte ikke å lage en ledig partnerkode. Prøv igjen.");
}
