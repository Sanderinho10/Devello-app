import { BoligmappaKort } from "../_deler/BoligmappaKort";
import { KrevOrdre } from "../_deler/OrdreSjekk";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { BoligmappaConnectionPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Koplingen til Boligmappa. Tokens har ingen policy; status og navn leses
 * via service role. Tilbakekallet fra Boligmappa lander her med ?bm_koblet=
 * eller ?bm_feil=.
 */
export default async function BoligmappaPage({
  searchParams,
}: {
  searchParams: Promise<{ bm_koblet?: string; bm_feil?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();
  const [{ data: kopling }, { data: me }] = await Promise.all([
    supabaseAdmin()
      .from("boligmappa_connections")
      .select("environment, status, status_reason, bm_user_name, bm_company_name, created_at")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  return (
    <KrevOrdre>
      <BoligmappaKort
        kopling={(kopling as BoligmappaConnectionPublic | null) ?? null}
        erAdmin={me?.role === "admin"}
        konfigurert={Boolean(process.env.BOLIGMAPPA_CLIENT_ID && process.env.BOLIGMAPPA_CLIENT_SECRET)}
        melding={{ feil: sp.bm_feil, koblet: sp.bm_koblet }}
      />
    </KrevOrdre>
  );
}
