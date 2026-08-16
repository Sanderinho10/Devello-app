import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToneSettings } from "@/lib/types";

/**
 * Oppdaterer deler av tone_settings uten å røre resten.
 *
 * To sider skriver hit: Selskap eier målformen, tilbudsagenten eier signatur
 * og tilleggsinstruks. Skrev begge hele objektet, ville den som lagret sist
 * slettet det den andre nettopp la inn — og ingen av dem ville merket det før
 * neste tilbud kom ut på feil målform.
 */
export async function mergeToneSettings(
  admin: SupabaseClient,
  companyId: string,
  endringer: Partial<ToneSettings>,
): Promise<{ error?: string }> {
  const { data: company, error: readError } = await admin
    .from("companies")
    .select("tone_settings")
    .eq("id", companyId)
    .single();
  if (readError) return { error: readError.message };

  const gjeldende = (company?.tone_settings ?? {}) as ToneSettings;
  const neste: ToneSettings = { ...gjeldende, ...endringer };

  // undefined betyr «tømt av brukeren» her, og et tomt felt skal ut av
  // objektet i stedet for å ligge igjen som null i prompten.
  for (const key of Object.keys(neste) as (keyof ToneSettings)[]) {
    if (neste[key] === undefined || neste[key] === "") delete neste[key];
  }

  const { error } = await admin
    .from("companies")
    .update({ tone_settings: neste })
    .eq("id", companyId);

  return error ? { error: error.message } : {};
}
