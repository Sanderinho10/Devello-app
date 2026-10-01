import { Pakkar } from "./Pakkar";
import { abonnementsoversikt } from "@/lib/billing/subscription";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AbonnementPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: me }] = await Promise.all([
    supabase.from("companies").select("trial_ends_at, partner_code, created_at").eq("id", session!.companyId).single(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  // Abonnement og forbruk ligger bak service role — tabellene har ingen
  // policy for authenticated. Selskapet leses ut fra sesjonen, aldri fra
  // noe klienten har sendt.
  const oversikt = await abonnementsoversikt(supabaseAdmin(), session!.companyId, company?.created_at ?? new Date().toISOString());

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Abonnement</h1>
          <p className="page-subtitle">Én pakke, lav grunnpris, og dere betaler for det dere faktisk bruker.</p>
        </div>
      </div>

      <Pakkar
        oversikt={{
          ...oversikt,
          periode: { start: oversikt.periode.start.toISOString(), slutt: oversikt.periode.slutt.toISOString(), nummer: oversikt.periode.nummer },
        }}
        trialEndsAt={company?.trial_ends_at ?? null}
        partnerCode={company?.partner_code ?? null}
        isAdmin={me?.role === "admin"}
      />
    </>
  );
}
