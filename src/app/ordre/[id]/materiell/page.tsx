import { notFound } from "next/navigation";
import { MateriellFane } from "./MateriellFane";
import { hentOrdre, ordreErLaast } from "@/lib/ordre/hent";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { MaterialEntry } from "@/lib/types";
import type { FakturaInfo, HodeFaktura } from "./MateriellFane";

export const dynamic = "force-dynamic";

export default async function MateriellSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: entries }, { data: company }, { count: grossistar }, { data: hodeFakturaer }] = await Promise.all([
    supabase
      .from("material_entries")
      .select("*")
      .eq("order_id", ordre.id)
      .order("registered_at", { ascending: false }),
    supabase
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session!.companyId)
      .single(),
    supabase
      .from("suppliers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", session!.companyId)
      .eq("active", true),
    // Fakturaer koblet til ordren som helhet — de uten EHF, der Go bare
    // har hodet. De gir ingen materiell-linjer, men montøren må se at
    // de finnes, ellers ser ordren ut som om ingenting er kjøpt.
    supabase
      .from("supplier_invoices")
      .select("id, invoice_no, voucher_no, voucher_type, supplier_name, voucher_date, net_amount, has_ehf, parse_error")
      .eq("order_id", ordre.id)
      .eq("line_count", 0)
      .order("voucher_date", { ascending: false }),
  ]);

  // Linjer fra leverandørfakturaer: hvilken faktura, hvilken leverandør,
  // hvilken dato — det merket viser. Én ekstra spørring bare når det finnes.
  const linjeIds = ((entries ?? []) as MaterialEntry[])
    .map((e) => e.invoice_line_id)
    .filter((id): id is string => Boolean(id));
  const fakturaInfo: Record<string, FakturaInfo> = {};
  if (linjeIds.length) {
    const { data: linjer } = await supabase
      .from("supplier_invoice_lines")
      .select("id, invoice_id, supplier_invoices!inner(id, invoice_no, voucher_no, supplier_name, voucher_date)")
      .in("id", linjeIds);
    for (const l of linjer ?? []) {
      const f = l.supplier_invoices as unknown as {
        id: string;
        invoice_no: string | null;
        voucher_no: number | null;
        supplier_name: string | null;
        voucher_date: string | null;
      };
      fakturaInfo[l.id] = {
        invoice_id: f.id,
        invoice_no: f.invoice_no ?? (f.voucher_no ? String(f.voucher_no) : ""),
        supplier_name: f.supplier_name,
        voucher_date: f.voucher_date,
      };
    }
  }

  return (
    <MateriellFane
      orderId={ordre.id}
      laast={ordreErLaast(ordre)}
      entries={(entries ?? []) as MaterialEntry[]}
      standardPaaslag={Number(company?.materials_markup_pct ?? 25)}
      harKatalog={(grossistar ?? 0) > 0}
      fakturaInfo={fakturaInfo}
      hodeFakturaer={(hodeFakturaer ?? []) as HodeFaktura[]}
    />
  );
}
