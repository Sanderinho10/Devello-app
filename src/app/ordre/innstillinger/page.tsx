import { PaaslagForm } from "./PaaslagForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrdreInnstillingerPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: meg }] = await Promise.all([
    supabase
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session!.companyId)
      .single(),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">Det som gjelder alle ordrer. Prisfilen ligger under Tilbud.</p>
        </div>
      </div>

      <PaaslagForm
        paaslag={Number(company?.materials_markup_pct ?? 25)}
        erAdmin={meg?.role === "admin"}
      />
    </>
  );
}
