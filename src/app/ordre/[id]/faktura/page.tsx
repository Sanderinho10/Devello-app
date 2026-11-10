import { notFound } from "next/navigation";
import { FakturaFane, type FakturaKunde } from "./FakturaFane";
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

  // Kunden på ordren og fakturakunden (0058). Uten eget valg er de den samme.
  const fakturaKundeId = utkast?.customer_id ?? ordre.customer_id ?? null;
  const ider = [...new Set([ordre.customer_id, fakturaKundeId].filter((x): x is string => Boolean(x)))];
  const { data: kundeRader } = ider.length
    ? await supabase.from("customers").select("id, name, contact, is_person, customer_no").in("id", ider)
    : { data: [] };
  const kundeAv = new Map((kundeRader ?? []).map((k) => [k.id as string, k]));
  const somKunde = (id: string | null, reserve: { name: string; contact: string | null }): FakturaKunde => {
    const k = id ? kundeAv.get(id) : undefined;
    return k
      ? { id: k.id, name: k.name, contact: k.is_person ? null : k.contact, customer_no: k.customer_no }
      : { id: null, name: reserve.name, contact: reserve.contact, customer_no: null };
  };
  const ordreKunde = somKunde(ordre.customer_id, { name: ordre.customer_name, contact: ordre.customer_contact });
  // Kunden på ordren: kontaktpersonen på ordren går foran kontaktkortet.
  if (ordre.customer_contact) ordreKunde.contact = ordre.customer_contact;
  const fakturaKunde =
    fakturaKundeId && fakturaKundeId !== ordre.customer_id
      ? somKunde(fakturaKundeId, { name: ordre.customer_name, contact: null })
      : ordreKunde;
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
      kundar={{ ordre: ordreKunde, faktura: fakturaKunde }}
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
