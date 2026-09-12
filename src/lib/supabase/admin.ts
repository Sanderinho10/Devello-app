import { createClient } from "@supabase/supabase-js";

/**
 * Service role-klienten, for seg selv.
 *
 * server.ts har også denne, men server.ts importerer `next/headers` for
 * cookies, og den modulen finnes bare inne i Next. Alt som skal kunne kjøre
 * som et vanlig Node-script (npm run evaluer, gullsett, test:agent) må derfor
 * hente admin-klienten herfra — ellers stopper importen før første linje av
 * scriptet får kjøre. server.ts re-eksporterer, så app-koden er uendret.
 */

/**
 * Omgår RLS — brukes bare der vi må røre tokens eller skrive på vegne av
 * agenten. Hvert bruk må selv sjekke hvilket company raden hører til.
 */
export function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Mangler miljøvariabel ${name}. Se .env.example og README for oppsett.`,
    );
  }
  return value;
}
