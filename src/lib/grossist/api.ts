import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import type { Supplier, SupplierFtpPublic } from "@/lib/types";

/** Modulen er på (403), grossisten er selskapets (404). */
export async function grossistForSkriving(
  admin: SupabaseClient,
  session: SessionContext,
  supplierId: string,
): Promise<Supplier | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;
  const { data } = await admin
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Fant ikke grossisten" }, { status: 404 });
  return data as Supplier;
}

/** FTP-oppsettet uten passord — det som kan gå til nettleseren. */
export function utanPassord(rad: Record<string, unknown> | null): SupplierFtpPublic | null {
  if (!rad) return null;
  const { password, company_id: _c, created_at: _a, updated_at: _u, ...rest } = rad as Record<string, unknown> & { password?: string };
  void _c;
  void _a;
  void _u;
  return { ...(rest as Omit<SupplierFtpPublic, "har_passord">), har_passord: Boolean(password) };
}
