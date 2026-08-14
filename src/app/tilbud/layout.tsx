import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

export default async function TilbudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
      <Sidebar
        companyName={company?.name ?? "Devello"}
        userEmail={session.email}
      />
      <main className="main">{children}</main>
    </div>
  );
}
