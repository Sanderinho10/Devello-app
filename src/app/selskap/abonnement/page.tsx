import { PlanPicker } from "./PlanPicker";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AbonnementPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: me }] = await Promise.all([
    supabase
      .from("companies")
      .select("plan, trial_ends_at, partner_code")
      .eq("id", session!.companyId)
      .single(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Abonnement</h1>
          <p className="page-subtitle">
            Pakke, prøveperiode og hva som er inkludert.
          </p>
        </div>
      </div>

      <PlanPicker
        plan={company?.plan ?? null}
        trialEndsAt={company?.trial_ends_at ?? null}
        partnerCode={company?.partner_code ?? null}
        isAdmin={me?.role === "admin"}
      />
    </>
  );
}
