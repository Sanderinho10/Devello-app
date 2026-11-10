import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FakturaFane, type FakturaKunde } from "@/app/ordre/[id]/faktura/FakturaFane";
import { manglandeProdukt } from "@/lib/faktura/go";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type InvoiceDraft, type ProductMap } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * En faktura laget rett i fakturafanen.
 *
 * En faktura fra en ordre hører hjemme på ordren — der ligger timene,
 * materiellet og tilbudet den bygger på — så den sendes dit. Resten er
 * samme visning som på ordren, uten agenten.
 */
export default async function FakturaSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const { data } = await supabase.from("invoice_drafts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const draft = data as InvoiceDraft;
  if (draft.order_id) redirect(`/ordre/${draft.order_id}/faktura`);

  const [{ data: kunde }, { data: kopling }] = await Promise.all([
    draft.customer_id
      ? supabase.from("customers").select("id, name, contact, is_person, customer_no").eq("id", draft.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("accounting_connections")
      .select("provider, environment, status, product_map, settings")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  // Uten ordre er det bare én kunde: den fakturaen sendes til.
  const fakturaKunde: FakturaKunde = {
    id: kunde?.id ?? null,
    name: draft.customer_name || kunde?.name || "",
    contact: draft.customer_contact ?? (kunde && !kunde.is_person ? kunde.contact : null),
    customer_no: kunde?.customer_no ?? null,
  };
  const aktivKopling = kopling && kopling.status !== "kopla_fra" ? kopling : null;

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <Link className="tilbake" href="/fakturaer">
            ← Fakturaer
          </Link>
          <h1>
            <span className="muted">Faktura</span> · {draft.title || fakturaKunde.name}
          </h1>
          <p className="page-subtitle">
            Opprettet {formatDate(draft.created_at)} · uten ordre
            {draft.transfer_order_no && ` · ordre ${draft.transfer_order_no} i regnskapssystemet`}
          </p>
        </div>
      </div>

      <FakturaFane
        orderId={null}
        orderStatus={null}
        draft={draft}
        klart={{ timar: 0, timarKr: 0, materiellLinjer: 0, materiellKr: 0, planlagt: null, harTilbod: false }}
        kundar={{ ordre: fakturaKunde, faktura: fakturaKunde }}
        kopling={
          aktivKopling
            ? {
                provider: aktivKopling.provider,
                feil: aktivKopling.status === "feil",
                manglandeProdukt: manglandeProdukt(draft.lines, (aktivKopling.product_map as ProductMap) ?? {}),
              }
            : null
        }
      />
    </>
  );
}
