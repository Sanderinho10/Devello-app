import { KrevOrdre } from "../_deler/OrdreSjekk";
import { RegnskapKort } from "../_deler/RegnskapKort";
import { pogoApplicationKey } from "@/lib/regnskap/poweroffice";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { AccountingConnectionPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Koplingen til PowerOffice Go. Uten client_key: kolonnerettene i 0035
 * nekter den, og vi ber ikke om den heller.
 */
export default async function RegnskapPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const [{ data: kopling }, { data: me }] = await Promise.all([
    supabase
      .from("accounting_connections")
      .select(
        "id, company_id, provider, environment, status, status_reason, sync_cursor, last_sync_at, last_sync_note, product_map, settings, created_at, updated_at",
      )
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  return (
    <KrevOrdre>
      <RegnskapKort
        kopling={(kopling as AccountingConnectionPublic | null) ?? null}
        erAdmin={me?.role === "admin"}
        applicationKeys={{ production: pogoApplicationKey("production"), demo: pogoApplicationKey("demo") }}
      />
    </KrevOrdre>
  );
}
