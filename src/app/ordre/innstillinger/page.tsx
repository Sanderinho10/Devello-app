import { BoligmappaKort } from "./BoligmappaKort";
import { PaaslagForm } from "./PaaslagForm";
import { RegnskapKort } from "./RegnskapKort";
import { pogoApplicationKey } from "@/lib/regnskap/poweroffice";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { AccountingConnectionPublic, BoligmappaConnectionPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdreInnstillingerPage({
  searchParams,
}: {
  searchParams: Promise<{ bm_feil?: string; bm_koblet?: string }>;
}) {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const sp = await searchParams;

  const [{ data: company }, { data: meg }, { data: kopling }, { data: boligmappa }] = await Promise.all([
    supabase
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session!.companyId)
      .single(),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
    // Uten client_key: kolonnerettighetene i 0035 nekter den, og vi ber
    // ikke om den heller.
    supabase
      .from("accounting_connections")
      .select(
        "id, company_id, provider, environment, status, status_reason, sync_cursor, last_sync_at, last_sync_note, product_map, settings, created_at, updated_at",
      )
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    // Tokens har ingen policy; status og navn leses via service role.
    supabaseAdmin()
      .from("boligmappa_connections")
      .select("environment, status, status_reason, bm_user_name, bm_company_name, created_at")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">Det som gjelder alle ordrer. Prisfilen ligger under Tilbud.</p>
        </div>
      </div>

      <div className="stack">
        <PaaslagForm
          paaslag={Number(company?.materials_markup_pct ?? 25)}
          erAdmin={meg?.role === "admin"}
        />
        <RegnskapKort
          kopling={(kopling as AccountingConnectionPublic | null) ?? null}
          erAdmin={meg?.role === "admin"}
          applicationKeys={{
            production: pogoApplicationKey("production"),
            demo: pogoApplicationKey("demo"),
          }}
        />
        <BoligmappaKort
          kopling={(boligmappa as BoligmappaConnectionPublic | null) ?? null}
          erAdmin={meg?.role === "admin"}
          konfigurert={Boolean(process.env.BOLIGMAPPA_CLIENT_ID && process.env.BOLIGMAPPA_CLIENT_SECRET)}
          melding={{ feil: sp.bm_feil, koblet: sp.bm_koblet }}
        />
      </div>
    </>
  );
}
