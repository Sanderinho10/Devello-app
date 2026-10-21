import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/server";
import { vurderTilgang, type Tilgang, type TilgangInput } from "./tilgang-regel";

/**
 * Har selskapet tilgang til programmet nå?
 *
 * Som i Go: uten et aktivt abonnement kan man ikke gjøre noe annet enn å
 * velge pakke. Aktivt betyr ett av disse:
 *   - unntak (companies.abonnement_unntak) — demo- og testselskapet, som
 *     alltid har løpende abonnement og aldri faktureres
 *   - en pakke (subscriptions)
 *   - prøveperioden er ikke ute
 *
 * En faktura fra Devello som ikke er betalt ved forfall, gir et varsel som
 * ikke kan lukkes. 30 dager etter forfall deaktiveres kontoen — også med
 * pakke — til fakturaen er betalt.
 *
 * Sjekken brukes både av sidene (AppShell) og API-et (sessionOr401), så
 * menyen og sperren kan ikke sprike.
 */

export {
  DAGER_TIL_DEAKTIVERING,
  vurderTilgang,
  type Tilgang,
  type TilgangGrunn,
  type TilgangInput,
  type UbetaltFaktura,
} from "./tilgang-regel";

/** Tilgangen for selskapet. Ett oppslag, og hentes én gang per request. */
export const hentTilgang = cache(async (companyId: string): Promise<Tilgang> => {
  return lesTilgang(supabaseAdmin(), companyId);
});

export async function lesTilgang(admin: SupabaseClient, companyId: string): Promise<Tilgang> {
  const [{ data: company }, { data: sub }, { data: fakturaer }] = await Promise.all([
    admin.from("companies").select("trial_ends_at, abonnement_unntak").eq("id", companyId).maybeSingle(),
    admin.from("subscriptions").select("id").eq("company_id", companyId).maybeSingle(),
    admin
      .from("devello_fakturaer")
      .select("fakturanr, belop_nok, forfall, betalt_at")
      .eq("company_id", companyId)
      .is("betalt_at", null),
  ]);
  // Før migrasjon 0054 finnes ikke kolonnen. Da gjelder de håndstyrte
  // pilotselskapene (moduler_overstyrt) som unntak, så ingen sperres ved en
  // feil rekkefølge på utrulling og migrasjon.
  let unntak = Boolean(company?.abonnement_unntak);
  let trial = (company?.trial_ends_at as string | null) ?? null;
  if (!company) {
    const { data: gammel } = await admin
      .from("companies")
      .select("trial_ends_at, moduler_overstyrt")
      .eq("id", companyId)
      .maybeSingle();
    unntak = Boolean(gammel?.moduler_overstyrt);
    trial = (gammel?.trial_ends_at as string | null) ?? null;
  }
  return vurderTilgang({
    unntak,
    harAbonnement: Boolean(sub),
    trialEndsAt: trial,
    fakturaer: (fakturaer ?? []) as TilgangInput["fakturaer"],
  });
}
