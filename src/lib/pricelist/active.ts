import type { SupabaseClient } from "@supabase/supabase-js";
import type { PriceListItem } from "@/lib/types";

/**
 * Prisrader fra aktive lister.
 *
 * En deaktivert liste blir liggende i databasen, men skal ikke kunne dukke opp
 * i et tilbud — derfor filtreres det på listen og ikke bare på raden.
 */
export async function activePriceItems(
  admin: SupabaseClient,
  companyId: string,
): Promise<PriceListItem[]> {
  const { data: lists } = await admin
    .from("price_lists")
    .select("id")
    .eq("company_id", companyId)
    .eq("active", true);

  const listIds = (lists ?? []).map((list) => list.id);
  if (listIds.length === 0) return [];

  const { data: items } = await admin
    .from("price_list_items")
    .select("*")
    .in("price_list_id", listIds)
    .eq("active", true);

  return (items ?? []) as PriceListItem[];
}
