import { cache } from "react";
import { currentSession, supabaseServer } from "@/lib/supabase/server";

/**
 * Modulane selskapet har, éin gong per førespurnad.
 *
 * Fanestripa (layout) og sidene under treng same svar. React cacher kallet,
 * så dei deler eitt oppslag i staden for å spørje databasen kvar for seg.
 */
export const selskapetsModular = cache(async (): Promise<string[]> => {
  const session = await currentSession();
  if (!session) return [];
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("companies")
    .select("moduler")
    .eq("id", session.companyId)
    .single();
  return (data?.moduler as string[] | null) ?? [];
});
