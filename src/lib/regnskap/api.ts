import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/supabase/server";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SupplierInvoice } from "@/lib/types";

/**
 * Felles inngang for rutene på én leverandørfaktura: modulen er på (403),
 * fakturaen er selskapets (404). Tilgangssjekken ligger i spørringen.
 */
export async function fakturaForSkriving(
  admin: SupabaseClient,
  session: SessionContext,
  invoiceId: string,
): Promise<SupplierInvoice | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data } = await admin
    .from("supplier_invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Fant ikke fakturaen" }, { status: 404 });
  }
  return data as SupplierInvoice;
}

export function erKreditnota(faktura: Pick<SupplierInvoice, "voucher_type">): boolean {
  return /credit/i.test(faktura.voucher_type);
}
