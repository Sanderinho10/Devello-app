import { redirect } from "next/navigation";
import { AbonnementSperre, BetalingsVarsel } from "@/components/AbonnementVarsel";
import { Sidebar } from "@/components/Sidebar";
import { hentTilgang } from "@/lib/billing/tilgang";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

/**
 * Skallet rundt de innloggede sidene.
 *
 * Agentene og selskapsdelen deler sidebar, så innloggingssjekken og
 * selskapsoppslaget hører hjemme ett sted — ikke duplisert i hver layout.
 *
 * Her sitter også abonnementssperren (lib/billing/tilgang.ts): uten aktivt
 * abonnement vises sperren i stedet for siden. `aapen` slipper siden
 * gjennom likevel — bare Selskap, så man kan velge pakke. En forfalt,
 * ubetalt faktura gir et varsel øverst på alle sider, som ikke kan lukkes.
 */
export async function AppShell({ children, aapen = false }: { children: React.ReactNode; aapen?: boolean }) {
  const session = await currentSession();
  if (!session) redirect("/login");

  const supabase = await supabaseServer();
  const [{ data: company }, { data: meg }, tilgang] = await Promise.all([
    supabase.from("companies").select("name, moduler").eq("id", session.companyId).single(),
    supabase.from("users").select("role").eq("id", session.userId).maybeSingle(),
    hentTilgang(session.companyId),
  ]);

  return (
    <div className="shell">
      <Sidebar
        companyName={company?.name ?? "Devello"}
        userEmail={session.email}
        moduler={company?.moduler ?? []}
        aktiv={tilgang.aktiv}
      />
      <main className="main">
        {tilgang.ubetalt && <BetalingsVarsel ubetalt={tilgang.ubetalt} selskap={company?.name ?? "selskapet"} />}
        {tilgang.aktiv || aapen ? children : <AbonnementSperre tilgang={tilgang} erAdmin={meg?.role === "admin"} />}
      </main>
    </div>
  );
}

/**
 * Sperren for en del av Selskap (medlemmer, innstillinger). Selskap er åpent
 * for abonnementets skyld; resten av det er like stengt som programmet.
 */
export async function KrevAktivtAbonnement({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const tilgang = await hentTilgang(session.companyId);
  if (tilgang.aktiv) return <>{children}</>;
  const supabase = await supabaseServer();
  const { data: meg } = await supabase.from("users").select("role").eq("id", session.userId).maybeSingle();
  return <AbonnementSperre tilgang={tilgang} erAdmin={meg?.role === "admin"} />;
}
