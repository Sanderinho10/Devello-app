import { notFound } from "next/navigation";
import { MateriellFane } from "./MateriellFane";
import { hentOrdre, ordreErLaast } from "@/lib/ordre/hent";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { MaterialEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MateriellSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: entries }, { data: company }, { count: grossistar }] = await Promise.all([
    supabase
      .from("material_entries")
      .select("*")
      .eq("order_id", ordre.id)
      .order("registered_at", { ascending: false }),
    supabase
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session!.companyId)
      .single(),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", session!.companyId)
      .eq("active", true),
  ]);

  return (
    <MateriellFane
      orderId={ordre.id}
      laast={ordreErLaast(ordre)}
      entries={(entries ?? []) as MaterialEntry[]}
      standardPaaslag={Number(company?.materials_markup_pct ?? 25)}
      harKatalog={(grossistar ?? 0) > 0}
    />
  );
}
