import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

/**
 * Ordren, én gang per forespørsel.
 *
 * Layouten (header og faner) og fanen under henter samme ordre. React sin
 * cache() gjør at det andre kallet får svaret fra det første i samme
 * server-render — én spørring, ikke to. RLS gjelder: ordren finnes bare om
 * den er selskapets.
 */
export const hentOrdre = cache(async (id: string): Promise<Order | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  return (data as Order | null) ?? null;
});

/** Fakturert og avbrutt er avsluttet: ingen nye føringer. Lista står. */
export function ordreErLaast(order: Pick<Order, "status">): boolean {
  return order.status === "fakturert" || order.status === "avbrutt";
}
