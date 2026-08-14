import { PriceList } from "./PriceList";
import { supabaseServer } from "@/lib/supabase/server";
import type { PriceListItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PrisfilPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("price_list_items")
    .select("*")
    .order("kind")
    .order("name");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Prisfil</h1>
          <p className="page-subtitle">
            Strukturerte prisrader. Agenten slår opp herifrå og reknar aldri sjølv.
          </p>
        </div>
      </div>

      <PriceList items={(data ?? []) as PriceListItem[]} />
    </>
  );
}
