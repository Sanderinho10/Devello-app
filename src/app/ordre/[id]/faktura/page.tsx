import { notFound } from "next/navigation";
import { FakturaFane } from "./FakturaFane";
import { manglandeProdukt } from "@/lib/faktura/go";
import { hentOrdre } from "@/lib/ordre/hent";
import { summerMateriell, summerTimar } from "@/lib/ordre/summering";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { InvoiceDraft, MaterialEntry, ProductMap, TimeEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Faktura-fanen: forslaget, eller det som ligger klart til å bli et.
 * Alt skrives gjennom /api/orders/[id]/faktura; sida bare leser.
 */
export default async function FakturaSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: draft }, { data: timar }, { data: materiell }, { data: kopling }] = await Promise.all([
    supabase
      .from("invoice_drafts")
      .select("*")
      .eq("order_id", ordre.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("time_entries")
      .select("hours, unit_price, time_type_name, billable, invoice_draft_id")
      .eq("order_id", ordre.id),
    supabase
      .from("material_entries")
      .select("quantity, cost_price, sale_price, replaced_by, invoice_line_id, billable, invoice_draft_id")
      .eq("order_id", ordre.id),
    supabase
      .from("accounting_connections")
      .select("provider, environment, status, product_map, settings")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  const utkast = (draft as InvoiceDraft | null) ?? null;
  const timesum = summerTimar(((timar ?? []) as TimeEntry[]).filter((t) => t.billable && !t.invoice_draft_id));
  const materiellsum = summerMateriell(
    ((materiell ?? []) as MaterialEntry[]).filter((m) => m.billable && !m.invoice_draft_id),
  );
  const aktivKopling = kopling && kopling.status !== "kopla_fra" ? kopling : null;

  return (
    <FakturaFane
      orderId={ordre.id}
      orderStatus={ordre.status}
      draft={utkast}
      klart={{
        timar: timesum.timar,
        timarKr: timesum.kr,
        materiellLinjer: materiellsum.linjer,
        materiellKr: materiellsum.sal,
        planlagt: ordre.planned_total === null ? null : Number(ordre.planned_total),
        harTilbod: Boolean(ordre.quote_snapshot?.document),
      }}
      kopling={
        aktivKopling
          ? {
              provider: aktivKopling.provider,
              feil: aktivKopling.status === "feil",
              manglandeProdukt: utkast ? manglandeProdukt(utkast.lines, (aktivKopling.product_map as ProductMap) ?? {}) : [],
            }
          : null
      }
    />
  );
}
