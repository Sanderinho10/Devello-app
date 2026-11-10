import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { erDevelloAdmin } from "@/lib/devello-admin";
import { currentSession } from "@/lib/supabase/server";

/**
 * Devellos egne sider, på tvers av selskapene. Bare for adressene i
 * DEVELLO_ADMIN_EPOST — for alle andre finnes ikke siden. Åpen også om eget
 * selskap skulle stå uten abonnement.
 */
export default async function DevelloLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!erDevelloAdmin(session?.email)) notFound();
  return <AppShell aapen>{children}</AppShell>;
}
