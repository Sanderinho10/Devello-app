import type { SupabaseClient } from "@supabase/supabase-js";
import { finnPakke } from "@/lib/billing/katalog";

/**
 * Modulane eit selskap har.
 *
 * Modulane er produktpakkar: tilbud, ordre, eller begge. Kva eit selskap
 * har, står i companies.moduler og blir sett FRÅ pakken (og frå prøvetida)
 * av oppdaterModular() — ved val av pakke, ved registrering, og kvar natt
 * så prøvetid som går ut og oppseiingar som trer i kraft blir spegla utan
 * at nokon trykkjer. Pilotkundar Devello styrer for hand har
 * moduler_overstyrt = true, og då rører vi ikkje kolonnen.
 *
 * harModul() les berre companies.moduler. Verken sidemenyen eller
 * API-rutene treng vite kvar svaret kjem frå.
 */

export type ModulId = "tilbud" | "ordre";

export const ALLE_MODULAR: ModulId[] = ["tilbud", "ordre"];

export function harModul(moduler: string[] | null | undefined, id: ModulId): boolean {
  return Array.isArray(moduler) && moduler.includes(id);
}

/** Kva modulane skal vere, gitt pakke og prøvetid. Rein, testbar. */
export function modularFor(input: { packageId: string | null; trialEndsAt: string | null; no?: Date }): ModulId[] {
  const pakke = finnPakke(input.packageId);
  if (pakke) return [...pakke.moduler];
  const no = input.no ?? new Date();
  if (input.trialEndsAt && new Date(input.trialEndsAt) > no) return [...ALLE_MODULAR];
  return [];
}

/** Skriv companies.moduler frå abonnementet og prøvetida. Overstyrte selskap står urørte. */
export async function oppdaterModular(admin: SupabaseClient, companyId: string): Promise<ModulId[] | null> {
  const [{ data: company }, { data: sub }] = await Promise.all([
    admin.from("companies").select("moduler, moduler_overstyrt, trial_ends_at").eq("id", companyId).maybeSingle(),
    admin.from("subscriptions").select("package_id").eq("company_id", companyId).maybeSingle(),
  ]);
  if (!company) return null;
  if (company.moduler_overstyrt) return (company.moduler as ModulId[]) ?? [];

  const moduler = modularFor({ packageId: (sub?.package_id as string | null) ?? null, trialEndsAt: company.trial_ends_at as string | null });
  const naa = ((company.moduler as string[]) ?? []).slice().sort().join(",");
  if (naa !== moduler.slice().sort().join(",")) {
    const { error } = await admin.from("companies").update({ moduler }).eq("id", companyId);
    if (error) throw new Error(error.message);
  }
  return moduler;
}
