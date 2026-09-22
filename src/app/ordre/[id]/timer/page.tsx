import { notFound } from "next/navigation";
import { TimerFane } from "./TimerFane";
import { hentOrdre, ordreErLaast } from "@/lib/ordre/hent";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { TimeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TimerSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: entries }, { data: medlemmer }, { data: timetypar }, { data: meg }] =
    await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("order_id", ordre.id)
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("users")
        .select("id, full_name, email")
        .eq("company_id", session!.companyId)
        .order("full_name"),
      // Timetypene: aktive rader av typen «time» i aktive lister. Samme
      // regel som API-et håndhever.
      supabase
        .from("price_list_items")
        .select("id, name, unit, unit_price, price_lists!inner(active)")
        .eq("company_id", session!.companyId)
        .eq("kind", "time")
        .eq("active", true)
        .eq("price_lists.active", true)
        .order("position")
        .order("name"),
      supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
    ]);

  return (
    <TimerFane
      orderId={ordre.id}
      laast={ordreErLaast(ordre)}
      entries={(entries ?? []) as TimeEntry[]}
      medlemmer={(medlemmer ?? []).map((m) => ({
        id: m.id,
        navn: m.full_name || m.email,
      }))}
      timetypar={(timetypar ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        unit: t.unit,
        unit_price: Number(t.unit_price),
      }))}
      meg={{ id: session!.userId, erAdmin: meg?.role === "admin" }}
    />
  );
}
