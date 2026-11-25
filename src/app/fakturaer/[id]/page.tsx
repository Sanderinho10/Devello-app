import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FakturaFane, type FakturaKunde } from "@/app/ordre/[id]/faktura/FakturaFane";
import { manglandeProdukt } from "@/lib/faktura/go";
import { Historikk } from "@/components/Historikk";
import { hentAktivitet } from "@/lib/aktivitet";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type InvoiceDraft, type Order, type ProductMap } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * En faktura laget rett i fakturafanen, eller en akontofaktura (0071).
 *
 * Fakturaforslaget fra en ordre hører hjemme på ordren — der ligger timene,
 * materiellet og tilbudet det bygger på — så det sendes dit. En
 * akontofaktura er sitt eget utkast på ordren og vises her, med vei tilbake
 * til ordren. Resten er samme visning som på ordren, uten agenten.
 */
export default async function FakturaSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const { data } = await supabase.from("invoice_drafts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const draft = data as InvoiceDraft;
  if (draft.order_id && !draft.is_akonto) redirect(`/ordre/${draft.order_id}/faktura`);

  const [{ data: ordreRad }, { data: kunde }, { data: kopling }, historikk] = await Promise.all([
    draft.order_id
      ? supabase
          .from("orders")
          .select("id, order_no, title, status, customer_id, customer_name, customer_contact")
          .eq("id", draft.order_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    draft.customer_id
      ? supabase.from("customers").select("id, name, contact, is_person, customer_no").eq("id", draft.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("accounting_connections")
      .select("provider, environment, status, product_map, settings")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    // Fakturaen over er hentet med brukerens tilgang, så selskapet er sjekket.
    hentAktivitet(supabaseAdmin(), { companyId: session!.companyId, objekt: "faktura", objektId: draft.id }),
  ]);

  const ordre = (ordreRad as Pick<
    Order,
    "id" | "order_no" | "title" | "status" | "customer_id" | "customer_name" | "customer_contact"
  > | null) ?? null;
  if (draft.order_id && !ordre) notFound();

  // Uten ordre er det bare én kunde: den fakturaen sendes til. På en
  // akontofaktura er kunden på ordren forslaget, og den kan overstyres (0058).
  const fakturaKunde: FakturaKunde = {
    id: kunde?.id ?? null,
    name: draft.customer_name || kunde?.name || ordre?.customer_name || "",
    contact:
      draft.customer_contact ?? (kunde && !kunde.is_person ? kunde.contact : null) ?? (kunde ? null : (ordre?.customer_contact ?? null)),
    customer_no: kunde?.customer_no ?? null,
  };
  const overstyrt = Boolean(ordre && draft.customer_id && draft.customer_id !== ordre.customer_id);
  const ordreKunde: FakturaKunde =
    ordre && overstyrt
      ? { id: ordre.customer_id, name: ordre.customer_name, contact: ordre.customer_contact, customer_no: null }
      : ordre
        ? { ...fakturaKunde, contact: ordre.customer_contact ?? fakturaKunde.contact }
        : fakturaKunde;
  const aktivKopling = kopling && kopling.status !== "kopla_fra" ? kopling : null;

  return (
    <>
      <div className="page-header kompakt">
        <div>
          {ordre ? (
            <Link className="tilbake" href={`/ordre/${ordre.id}/faktura`}>
              ← Ordre #{ordre.order_no}
            </Link>
          ) : (
            <Link className="tilbake" href="/fakturaer">
              ← Fakturaer
            </Link>
          )}
          <h1>
            <span className="muted">{ordre ? `A konto nr. ${draft.akonto_no}` : "Faktura"}</span> ·{" "}
            {ordre ? ordre.title : draft.title || fakturaKunde.name}
          </h1>
          <p className="page-subtitle">
            Opprettet {formatDate(draft.created_at)} · {ordre ? `ordre #${ordre.order_no} · ${fakturaKunde.name}` : "uten ordre"}
            {draft.transfer_order_no && ` · ordre ${draft.transfer_order_no} i regnskapssystemet`}
          </p>
        </div>
        <Historikk poster={historikk} />
      </div>

      <FakturaFane
        orderId={ordre?.id ?? null}
        orderStatus={ordre?.status ?? null}
        draft={draft}
        klart={{ timar: 0, timarKr: 0, materiellLinjer: 0, materiellKr: 0, planlagt: null, harTilbod: false }}
        kundar={{ ordre: ordreKunde, faktura: fakturaKunde }}
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
