import { AppShell } from "@/components/AppShell";
import { ModulMangler } from "@/components/ModulMangler";
import { harModul } from "@/lib/moduler";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

/**
 * Kalenderen høyrer til ordremodulen: oppdraga er ordrar, og montørane er
 * dei same. Same sperre som /ordre — og API-et sjekkar sjølv.
 */
export default async function KalenderLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  let aktiv = false;
  if (session) {
    const supabase = await supabaseServer();
    const { data: company } = await supabase.from("companies").select("moduler").eq("id", session.companyId).single();
    aktiv = harModul(company?.moduler, "ordre");
  }
  return <AppShell>{aktiv ? children : <ModulMangler modul="Ordre" />}</AppShell>;
}
