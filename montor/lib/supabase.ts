import { createClient } from "@supabase/supabase-js";
import { sesjonslager } from "./sesjonslager";

/**
 * Supabase-klienten — bare Auth. Ingen tabellkall fra appen; alt går via
 * API-et med Bearer-token. Sesjonen ligger i sesjonslageret (kryptert, med
 * nøkkelen i Keychain/Keystore).
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Sant når miljøvariablene mangler — innloggingsskjermen sier fra i stedet for at appen krasjer. */
export const manglerKonfig = !url || !anonKey || !process.env.EXPO_PUBLIC_API_URL;

export const supabase = createClient(url || "https://mangler.invalid", anonKey || "mangler", {
  auth: {
    storage: sesjonslager,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
