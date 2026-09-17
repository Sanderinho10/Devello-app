import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kjelder, MaterialSource, QuoteSectionSource, TimeSource } from "./typar";
import type { MaterialEntry, Order, QuoteDocument, TimeEntry } from "@/lib/types";

/**
 * Kildene til et fakturaforslag, hentet fra databasen og gitt id-er.
 *
 * Tilbudet ligger som frosset kopi på ordren uten id-er på seksjoner og
 * linjer; her får de stabile id-er etter posisjon («s1», «s1-l2»). De er
 * stabile fordi snapshotet er det — det endres aldri etter oppretting.
 * Timer og materiell har sine egne uuid-er.
 */
export async function hentKjelder(
  admin: SupabaseClient,
  ordre: Pick<Order, "id" | "company_id" | "quote_type" | "quote_snapshot">,
): Promise<{ kjelder: Kjelder; timar: TimeEntry[]; materiell: MaterialEntry[] }> {
  const [{ data: timarRaa }, { data: materiellRaa }, { data: brukarar }, { data: linjeInfo }] =
    await Promise.all([
      admin
        .from("time_entries")
        .select("*")
        .eq("order_id", ordre.id)
        .eq("company_id", ordre.company_id)
        .order("work_date", { ascending: true }),
      admin
        .from("material_entries")
        .select("*")
        .eq("order_id", ordre.id)
        .eq("company_id", ordre.company_id)
        .order("registered_at", { ascending: true }),
      admin.from("users").select("id, full_name, email").eq("company_id", ordre.company_id),
      admin
        .from("supplier_invoice_lines")
        .select("id, supplier_invoices!inner(invoice_no, voucher_no)")
        .eq("order_id", ordre.id),
    ]);

  const timar = (timarRaa ?? []) as TimeEntry[];
  const materiell = (materiellRaa ?? []) as MaterialEntry[];
  const namn = new Map((brukarar ?? []).map((b) => [b.id as string, (b.full_name as string | null) || (b.email as string)]));
  const fakturaNr = new Map<string, string | null>();
  for (const l of linjeInfo ?? []) {
    const f = l.supplier_invoices as unknown as { invoice_no: string | null; voucher_no: number | null };
    fakturaNr.set(l.id as string, f.invoice_no ?? (f.voucher_no ? String(f.voucher_no) : null));
  }

  const document = (ordre.quote_snapshot?.document ?? null) as QuoteDocument | null;
  const sections: QuoteSectionSource[] = (document?.sections ?? []).map((s, si) => ({
    id: `s${si + 1}`,
    title: s.title,
    lines: s.lines.map((l, li) => ({
      id: `s${si + 1}-l${li + 1}`,
      section_id: `s${si + 1}`,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_price: Number(l.unit_price),
      discount_pct: Number(l.discount_pct ?? 0) || 0,
    })),
  }));

  const kjelder: Kjelder = {
    quote_type: ordre.quote_type ?? (ordre.quote_snapshot?.quote_type ?? null),
    sections,
    assumptions: document?.assumptions ?? [],
    vat_pct: Number(document?.vat_rate ?? 25),
    timar: timar.map(
      (t): TimeSource => ({
        id: t.id,
        work_date: t.work_date,
        user_name: namn.get(t.user_id) ?? "(ukjent)",
        time_type_name: t.time_type_name,
        unit_price: Number(t.unit_price),
        hours: Number(t.hours),
        note: t.note,
        billable: t.billable,
        invoiced: Boolean(t.invoice_draft_id),
      }),
    ),
    materiell: materiell.map(
      (m): MaterialSource => ({
        id: m.id,
        source: m.source,
        item_no: m.item_no,
        name: m.name,
        quantity: Number(m.quantity),
        unit: m.unit,
        cost_price: m.cost_price === null ? null : Number(m.cost_price),
        sale_price: Number(m.sale_price),
        note: m.note,
        billable: m.billable,
        replaced: Boolean(m.replaced_by),
        invoiced: Boolean(m.invoice_draft_id),
        invoice_no: m.invoice_line_id ? (fakturaNr.get(m.invoice_line_id) ?? null) : null,
      }),
    ),
  };

  return { kjelder, timar, materiell };
}
