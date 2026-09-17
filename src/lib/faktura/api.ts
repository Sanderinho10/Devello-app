import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import type { InvoiceDraft, Order } from "@/lib/types";

/**
 * Felles inngang for fakturarutene: modulen er på (403), ordren er
 * selskapets (404), og det siste utkastet på ordren om det finnes.
 * Ordrestatus sjekkes ikke her — hver rute har sin egen regel.
 */
export async function ordreOgUtkast(
  admin: SupabaseClient,
  session: SessionContext,
  orderId: string,
): Promise<{ ordre: Order; draft: InvoiceDraft | null } | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data: ordre } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!ordre) return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });

  const { data: draft } = await admin
    .from("invoice_drafts")
    .select("*")
    .eq("order_id", orderId)
    .eq("company_id", session.companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { ordre: ordre as Order, draft: (draft as InvoiceDraft | null) ?? null };
}
