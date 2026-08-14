import Link from "next/link";
import { notFound } from "next/navigation";
import { ListItems } from "./ListItems";
import { supabaseServer } from "@/lib/supabase/server";
import {
  PRICE_KIND_HELP,
  PRICE_KIND_LABELS,
  type PriceList,
  type PriceListItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PriceListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: list } = await supabase
    .from("price_lists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!list) notFound();

  const { data: items } = await supabase
    .from("price_list_items")
    .select("*")
    .eq("price_list_id", id)
    .order("name");

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="button ghost" href="/tilbud/prisfil" style={{ marginLeft: -10 }}>
            ← Prisfil
          </Link>
          <h1 style={{ marginTop: 6 }}>{list.name}</h1>
          <p className="page-subtitle">
            {PRICE_KIND_LABELS[(list as PriceList).kind]} ·{" "}
            {PRICE_KIND_HELP[(list as PriceList).kind]}
          </p>
        </div>
      </div>

      {!list.active && (
        <div className="banner warning">
          Lista er inaktiv. Agenten hentar ikkje postar herifrå før den blir
          aktivert igjen.
        </div>
      )}

      <ListItems list={list as PriceList} items={(items ?? []) as PriceListItem[]} />
    </>
  );
}
