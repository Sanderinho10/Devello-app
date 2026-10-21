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
    // Fila sin rekkefølge, ikke alfabetet. Se migrasjon 0038.
    .order("position")
    .order("name");

  const l = list as PriceList;
  return (
    <>
      <div className="inst-tittel">
        <Link className="tilbake" href="/selskap/innstillinger/prisfil">
          ← Prisfil
        </Link>
        <h2>
          {l.name}{" "}
          <span className={`pill ${l.active ? "ferdig" : ""}`} style={{ verticalAlign: "middle" }}>
            {l.active ? "Aktiv" : "Inaktiv"}
          </span>
        </h2>
        <p className="muted">
          {PRICE_KIND_LABELS[l.kind]} · {PRICE_KIND_HELP[l.kind]}
          {l.description && ` · ${l.description}`}
        </p>
      </div>

      {!l.active && (
        <div className="banner warning">Listen er inaktiv. Agenten henter ikke poster herfra før den blir aktivert igjen.</div>
      )}

      <ListItems list={l} items={(items ?? []) as PriceListItem[]} />
    </>
  );
}
