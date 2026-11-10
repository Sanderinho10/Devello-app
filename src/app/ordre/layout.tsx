import { AppShell } from "@/components/AppShell";
import { ModulMangler } from "@/components/ModulMangler";
import { harModul } from "@/lib/moduler";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

/**
 * Ordremodulen bak modulflagget.
 *
 * Sidemenyen skjuler Ordre for selskaper uten modulen, men en direkte URL
 * vet ikke det. Sjekken ligger derfor her, ikke i hver side — og API-et gjør
 * den samme sjekken selv, så en skjult side er aldri eneste sperre.
 */
export default async function OrdreLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  let aktiv = false;
  if (session) {
    const supabase = await supabaseServer();
    const { data: company } = await supabase
      .from("companies")
      .select("moduler")
      .eq("id", session.companyId)
      .single();
    aktiv = harModul(company?.moduler, "ordre");
  }

  return (
    <AppShell>
      {aktiv ? children : <ModulMangler modul="Ordre" />}
    </AppShell>
  );
}
