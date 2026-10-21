import { Postkasse, type PostkasseRad } from "../_deler/Postkasse";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Tilbakekallet fra Microsoft lander her, med ?koblet= eller ?feil=. */
export default async function PostkassePage({ searchParams }: { searchParams: Promise<{ koblet?: string; feil?: string }> }) {
  const sp = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();
  const { data: mailbox } = await supabase
    .from("mailbox_connections")
    .select("email_address, status, status_reason, last_synced_at, initial_fetch_from")
    .eq("company_id", session!.companyId)
    .maybeSingle();

  return (
    <>
      {sp.koblet && <div className="banner success">Koblet til {sp.koblet}.</div>}
      {sp.feil && <div className="banner error">{sp.feil}</div>}
      <Postkasse mailbox={(mailbox as PostkasseRad | null) ?? null} />
    </>
  );
}
