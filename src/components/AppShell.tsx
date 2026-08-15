import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

/**
 * Skallet rundt de innloggede sidene.
 *
 * Agentene og selskapsdelen deler sidebar, så innloggingssjekken og
 * selskapsoppslaget hører hjemme ett sted — ikke duplisert i hver layout.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");

  const supabase = await supabaseServer();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", session.companyId)
    .single();

  return (
    <div className="shell">
      <Sidebar companyName={company?.name ?? "Devello"} userEmail={session.email} />
      <main className="main">{children}</main>
    </div>
  );
}
