"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-klienten i nettleseren.
 *
 * Adressen og anon-nøkkelen kommer fra NEXT_PUBLIC_-variabler, som Next baker
 * inn i JavaScript-en under bygget — ikke ved oppstart. Mangler de i
 * byggemiljøet, blir de stående som undefined her, og appen ser helt frisk ut
 * helt til noen prøver å logge inn. Derfor sier vi det rett ut i stedet for å
 * la @supabase/ssr kaste sin engelske variant.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Appen er bygget uten Supabase-oppsett, så innlogging er ikke mulig. " +
        "NEXT_PUBLIC_SUPABASE_URL og NEXT_PUBLIC_SUPABASE_ANON_KEY må være " +
        "satt når bildet bygges — se docs/produksjonsoppsett.md.",
    );
  }

  return createBrowserClient(url, anonKey);
}
