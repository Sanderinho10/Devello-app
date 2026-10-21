import { KrevOrdre } from "../_deler/OrdreSjekk";
import { PaaslagForm } from "../_deler/PaaslagForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MateriellPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const [{ data: company }, { data: me }] = await Promise.all([
    supabase.from("companies").select("materials_markup_pct").eq("id", session!.companyId).single(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);
  return (
    <KrevOrdre>
      <PaaslagForm paaslag={Number(company?.materials_markup_pct ?? 25)} erAdmin={me?.role === "admin"} />
    </KrevOrdre>
  );
}
