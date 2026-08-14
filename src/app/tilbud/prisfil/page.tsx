import { PriceLists } from "./PriceLists";
import { supabaseServer } from "@/lib/supabase/server";
import type { PriceItemKind, PriceList } from "@/lib/types";

export const dynamic = "force-dynamic";

export interface PriceListWithCount extends PriceList {
  item_count: number;
}

export default async function PrisfilPage() {
  const supabase = await supabaseServer();

  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from("price_lists").select("*").order("kind").order("name"),
    supabase.from("price_list_items").select("price_list_id, active"),
  ]);

  // Teljinga gjer vi her framfor med ein aggregat-spørjing — talet på lister er
  // lite, og då slepp vi ein vy berre for dette.
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    if (!item.active) continue;
    counts.set(item.price_list_id, (counts.get(item.price_list_id) ?? 0) + 1);
  }

  const withCounts: PriceListWithCount[] = (lists ?? []).map((list) => ({
    ...(list as PriceList),
    item_count: counts.get(list.id) ?? 0,
  }));

  const byKind = (kind: PriceItemKind) =>
    withCounts.filter((list) => list.kind === kind);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Prisfil</h1>
          <p className="page-subtitle">
            Strukturerte prisrader, organiserte i lister. Agenten slår opp herifrå
            og reknar aldri sjølv.
          </p>
        </div>
      </div>

      <PriceLists
        punktpris={byKind("punktpris")}
        materiell={byKind("materiell")}
        time={byKind("time")}
      />
    </>
  );
}
