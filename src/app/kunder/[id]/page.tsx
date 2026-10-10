import Link from "next/link";
import { notFound } from "next/navigation";
import { KundeKort } from "./KundeKort";
import { supabaseServer } from "@/lib/supabase/server";
import {
  INVOICE_DRAFT_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  computeTotals,
  formatDate,
  formatNok,
  type Customer,
  type InvoiceDraftStatus,
  type Lead,
  type LeadStatus,
  type Order,
  type QuoteDocument,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Kundesiden: kundekortet og alt som hører til kunden — tilbud, ordrer og
 * fakturaforslag. Hver linje lenker videre til der arbeidet skjer; denne
 * siden er oversikten, ikke et nytt sted å redigere tilbud og ordrer.
 */
export default async function KundePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: kundeRad } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!kundeRad) notFound();
  const kunde = kundeRad as Customer;

  const [{ data: leadRader }, { data: ordreRader }] = await Promise.all([
    supabase
      .from("leads")
      .select("*, drafts(id, quote_no, revisjon, sent_at, confirmed_at, document)")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("orders").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
  ]);

  type DraftBit = {
    id: string;
    quote_no: number | null;
    revisjon: number;
    sent_at: string | null;
    confirmed_at: string | null;
    document: QuoteDocument | null;
  };
  const leads = (leadRader ?? []) as (Lead & { drafts: DraftBit | DraftBit[] | null })[];
  const ordrer = (ordreRader ?? []) as Order[];

  // Fakturaforslagene ligger på ordrene.
  type FakturaBit = {
    id: string;
    order_id: string;
    status: InvoiceDraftStatus;
    totals: { subtotal: number; vat: number; total: number } | null;
    transfer_order_no: string | null;
    created_at: string;
  };
  let fakturaer: FakturaBit[] = [];
  if (ordrer.length) {
    const { data } = await supabase
      .from("invoice_drafts")
      .select("id, order_id, status, totals, transfer_order_no, created_at")
      .in(
        "order_id",
        ordrer.map((o) => o.id),
      )
      .order("created_at", { ascending: false });
    fakturaer = (data ?? []) as FakturaBit[];
  }
  const ordreAv = new Map(ordrer.map((o) => [o.id, o]));

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="button ghost" href="/kunder" style={{ marginLeft: -10 }}>
            ← Kunder
          </Link>
          <h1 style={{ marginTop: 6 }}>{kunde.name}</h1>
          <p className="page-subtitle">
            {[kunde.contact, kunde.email, kunde.phone, kunde.address].filter(Boolean).join(" · ") ||
              "Ingen kontaktinfo ennå"}
          </p>
        </div>
      </div>

      <div className="stack">
        <KundeKort kunde={kunde} />

        <div className="card">
          <div className="card-header row-between">
            <h2>Tilbud</h2>
            <span className="muted">{leads.length}</span>
          </div>
          {leads.length === 0 ? (
            <div className="empty">
              <div>Ingen tilbud på denne kunden ennå.</div>
            </div>
          ) : (
            <div className="lead-list">
              {leads.map((lead) => {
                const draft = Array.isArray(lead.drafts) ? lead.drafts[0] : lead.drafts;
                const sum = draft?.document ? computeTotals(draft.document).subtotal : null;
                return (
                  <Link key={lead.id} href={`/tilbud/leads/${lead.id}`} className="lead-row clickable">
                    <span className="ordre-nr">{draft?.quote_no ? `T${draft.quote_no}` : "—"}</span>
                    <div className="lead-main">
                      <div className="lead-subject" style={{ cursor: "inherit" }}>
                        {draft?.document?.title || lead.subject || "(uten emne)"}
                      </div>
                      <div className="lead-meta">
                        {draft && draft.revisjon > 1 ? `Versjon ${draft.revisjon} · ` : ""}
                        {lead.source === "manuell" ? "Manuell henvendelse" : "E-post"}
                      </div>
                    </div>
                    <span className={`pill ${lead.status}`}>
                      {LEAD_STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
                    </span>
                    <span className="ordre-sum">{sum === null ? "—" : formatNok(sum)}</span>
                    <span className="lead-time">{formatDate(lead.received_at ?? lead.created_at)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header row-between">
            <h2>Ordrer</h2>
            <span className="muted">{ordrer.length}</span>
          </div>
          {ordrer.length === 0 ? (
            <div className="empty">
              <div>Ingen ordrer på denne kunden ennå.</div>
            </div>
          ) : (
            <div className="lead-list">
              {ordrer.map((ordre) => (
                <Link key={ordre.id} href={`/ordre/${ordre.id}`} className="lead-row clickable">
                  <span className="ordre-nr">#{ordre.order_no}</span>
                  <div className="lead-main">
                    <div className="lead-subject" style={{ cursor: "inherit" }}>
                      {ordre.title}
                    </div>
                    <div className="lead-meta">{ordre.site_address || "(ingen adresse)"}</div>
                  </div>
                  <span className={`pill ${ordre.status}`}>{ORDER_STATUS_LABELS[ordre.status]}</span>
                  <span className="ordre-sum">
                    {ordre.planned_total === null ? "—" : formatNok(Number(ordre.planned_total))}
                  </span>
                  <span className="lead-time">{formatDate(ordre.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header row-between">
            <h2>Fakturaforslag</h2>
            <span className="muted">{fakturaer.length}</span>
          </div>
          {fakturaer.length === 0 ? (
            <div className="empty">
              <div>Ingen fakturaforslag på denne kunden ennå.</div>
            </div>
          ) : (
            <div className="lead-list">
              {fakturaer.map((f) => {
                const ordre = ordreAv.get(f.order_id);
                return (
                  <Link key={f.id} href={`/ordre/${f.order_id}/faktura`} className="lead-row clickable">
                    <span className="ordre-nr">{ordre ? `#${ordre.order_no}` : "—"}</span>
                    <div className="lead-main">
                      <div className="lead-subject" style={{ cursor: "inherit" }}>
                        {ordre?.title ?? "Ordre"}
                      </div>
                      <div className="lead-meta">
                        {f.transfer_order_no ? `Go ${f.transfer_order_no}` : "Fakturaforslag"}
                      </div>
                    </div>
                    <span className={`pill ${fakturaPill(f.status)}`}>
                      {INVOICE_DRAFT_STATUS_LABELS[f.status] ?? f.status}
                    </span>
                    <span className="ordre-sum">
                      {f.totals ? formatNok(Number(f.totals.total)) : "—"}
                    </span>
                    <span className="lead-time">{formatDate(f.created_at)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Fakturastatusene låner fargene fra ordrestatusene — samme logikk som i Faktura-fanen. */
function fakturaPill(status: InvoiceDraftStatus): string {
  if (status === "overfort") return "fakturert";
  if (status === "godkjent") return "ferdig";
  if (status === "feil") return "avbrutt";
  return "opna";
}
