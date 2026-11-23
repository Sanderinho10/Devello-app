import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanySignature } from "@/lib/types";

/**
 * Lagrede signaturer — hvem som kan bruke hvilken.
 *
 * En signatur tilhører selskapet og kan være knyttet til en bruker. Den
 * brukeren kan signere med den selv. En administrator kan velge alle: det
 * er han som har lagt dem inn, og som godkjenner på vegne av firmaet.
 * Ingen andre kan signere med en annens navn.
 */

export interface SignaturValg {
  id: string;
  name: string;
  title: string | null;
  user_id: string | null;
  /** Kan den innloggede signere med denne? */
  kan_bruke: boolean;
}

export function kanBruke(s: Pick<CompanySignature, "user_id">, userId: string, erAdmin: boolean): boolean {
  return erAdmin || (s.user_id !== null && s.user_id === userId);
}

export async function hentSignaturer(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  erAdmin: boolean,
): Promise<SignaturValg[]> {
  const { data, error } = await admin
    .from("company_signatures")
    .select("id, name, title, user_id")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Pick<CompanySignature, "id" | "name" | "title" | "user_id">[]).map((s) => ({
    ...s,
    kan_bruke: kanBruke(s, userId, erAdmin),
  }));
}
