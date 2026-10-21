import Link from "next/link";
import { notFound } from "next/navigation";
import { KontaktKort } from "./KontaktKort";
import { kontakttypeTekst } from "@/lib/kunder/felt";
import { adresseTekst, fakturaadresse, hovedadresse } from "@/lib/kunder/adresse";
import { KlikkbarRad } from "@/components/KlikkbarRad";
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

type Fane = "tilbud" | "ordrer" | "fakturaer";

/**
 * Kontaktsiden er oversikten: kontaktinformasjonen til å lese, og for kunder
 * alt som hører til — tilbud, ordrer og fakturaforslag — i hver sin fane.
 * Skal kontakten endres, gjøres det i «Rediger kontakt», som åpner
 * kontaktkortet som popup. Hver linje lenker videre til der arbeidet skjer.
 */
export default async function KontaktPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vis?: string }>;
}) {
  const { id } = await params;
  const vis = (await searchParams).vis;
  const supabase = await supabaseServer();

  const { data: kontaktRad } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (!kontaktRad) notFound();
  const kunde = kontaktRad as Customer;

  // Gjelder kundenummeret i Go den koblingen selskapet har nå?
  let goNummerGjeld: boolean | null = null;
  if (kunde.accounting_customer_no) {
    const { data: kopling } = await supabase
      .from("accounting_connections")
      .select("id")
      .eq("company_id", kunde.company_id)
      .neq("status", "kopla_fra")
      .maybeSingle();
    goNummerGjeld = kopling ? kopling.id === kunde.accounting_connection_id : false;
  }

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
  const visKundedel = kunde.is_customer || leads.length > 0 || ordrer.length > 0;

  const fane: Fane = vis === "ordrer" || vis === "fakturaer" ? vis : "tilbud";
  const faktura = kunde.invoice_separate ? adresseTekst(fakturaadresse(kunde)) : "";
  const info: [string, React.ReactNode][] = [
    ["Kontaktperson", kunde.contact],
    ["E-post", kunde.email ? <a href={`mailto:${kunde.email}`}>{kunde.email}</a> : null],
    ["Telefon", kunde.phone ? <a href={`tel:${kunde.phone.replace(/\s/g, "")}`}>{kunde.phone}</a> : null],
    ["Adresse", adresseTekst(hovedadresse(kunde))],
    ...(faktura ? ([["Fakturaadresse", faktura]] as [string, React.ReactNode][]) : []),
    ["Org.nr.", kunde.org_nr],
    ["Kundenr. i Go", kunde.accounting_customer_no],
  ];

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <Link className="tilbake" href="/register/kontakter">
            ← Kontakter
          </Link>
          <h1>{kunde.name}</h1>
          <p className="page-subtitle">{kontakttypeTekst(kunde)}</p>
        </div>
        <KontaktKort kontakt={kunde} goNummerGjeld={goNummerGjeld} />
      </div>

      <div className="stack">
        {/* Kontaktinformasjonen til å lese. Endres i «Rediger kontakt». */}
        <div className="card card-pad">
          <dl className="kunde-kort-info">
            {info.map(([etikett, verdi]) => (
              <div key={etikett}>
                <dt>{etikett}</dt>
                <dd>{verdi || <span className="muted">—</span>}</dd>
              </div>
            ))}
          </dl>
          {kunde.notes && <p className="kontakt-notat">{kunde.notes}</p>}
        </div>

        {visKundedel && (
          <div>
            <nav className="type-switch kompakt" aria-label="Vis">
              {(
                [
                  ["tilbud", "Tilbud", leads.length],
                  ["ordrer", "Ordrer", ordrer.length],
                  ["fakturaer", "Fakturaforslag", fakturaer.length],
                ] as [Fane, string, number][]
              ).map(([verdi, etikett, antall]) => (
                <Link
                  key={verdi}
                  href={verdi === "tilbud" ? `/register/kontakter/${id}` : `/register/kontakter/${id}?vis=${verdi}`}
                  className={`type-option${fane === verdi ? " active" : ""}`}
                  aria-current={fane === verdi ? "page" : undefined}
                  scroll={false}
                >
                  {etikett}
                  <span className="fane-tal">{antall}</span>
                </Link>
              ))}
            </nav>

            <div className="card" style={{ marginTop: 12 }}>
              {fane === "tilbud" &&
                (leads.length === 0 ? (
                  <div className="empty">Ingen tilbud på denne kunden ennå.</div>
                ) : (
                  <div className="tabell-rull">
                    <table className="table klikkbar">
                      <thead>
                        <tr>
                          <th>Nr</th>
                          <th>Tilbud</th>
                          <th>Kilde</th>
                          <th>Status</th>
                          <th className="num">Sum eks. mva</th>
                          <th className="num">Mottatt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => {
                          const draft = Array.isArray(lead.drafts) ? lead.drafts[0] : lead.drafts;
                          const sum = draft?.document ? computeTotals(draft.document).subtotal : null;
                          const href = `/tilbud/leads/${lead.id}`;
                          return (
                            <KlikkbarRad key={lead.id} href={href}>
                              <td className="ordre-nr">{draft?.quote_no ?? ""}</td>
                              <td>
                                <Link className="lenke" href={href}>
                                  {draft?.document?.title || lead.subject || "(uten emne)"}
                                </Link>
                                {draft && draft.revisjon > 1 && (
                                  <span className="pill versjon" style={{ marginLeft: 6 }}>
                                    v{draft.revisjon}
                                  </span>
                                )}
                              </td>
                              <td className="muted">{lead.source === "manuell" ? "Manuell" : "E-post"}</td>
                              <td>
                                <span className={`pill ${lead.status}`}>
                                  {LEAD_STATUS_LABELS[lead.status as LeadStatus] ?? lead.status}
                                </span>
                              </td>
                              <td className="num nowrap">{sum === null ? "—" : formatNok(sum)}</td>
                              <td className="num muted nowrap">{formatDate(lead.received_at ?? lead.created_at)}</td>
                            </KlikkbarRad>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

              {fane === "ordrer" &&
                (ordrer.length === 0 ? (
                  <div className="empty">Ingen ordrer på denne kunden ennå.</div>
                ) : (
                  <div className="tabell-rull">
                    <table className="table klikkbar">
                      <thead>
                        <tr>
                          <th>Nr</th>
                          <th>Ordre</th>
                          <th>Jobbadresse</th>
                          <th>Status</th>
                          <th className="num">Planlagt sum</th>
                          <th className="num">Opprettet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordrer.map((ordre) => {
                          const href = `/ordre/${ordre.id}`;
                          return (
                            <KlikkbarRad key={ordre.id} href={href}>
                              <td className="ordre-nr">{ordre.order_no}</td>
                              <td>
                                <Link className="lenke" href={href}>
                                  {ordre.title}
                                </Link>
                              </td>
                              <td className="muted">{ordre.site_address}</td>
                              <td>
                                <span className={`pill ${ordre.status}`}>{ORDER_STATUS_LABELS[ordre.status]}</span>
                              </td>
                              <td className="num nowrap">
                                {ordre.planned_total === null ? "—" : formatNok(Number(ordre.planned_total))}
                              </td>
                              <td className="num muted nowrap">{formatDate(ordre.created_at)}</td>
                            </KlikkbarRad>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}

              {fane === "fakturaer" &&
                (fakturaer.length === 0 ? (
                  <div className="empty">Ingen fakturaforslag på denne kunden ennå.</div>
                ) : (
                  <div className="tabell-rull">
                    <table className="table klikkbar">
                      <thead>
                        <tr>
                          <th>Ordre</th>
                          <th>Gjelder</th>
                          <th>Ordrenr. i Go</th>
                          <th>Status</th>
                          <th className="num">Å betale</th>
                          <th className="num">Laget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fakturaer.map((f) => {
                          const ordre = ordreAv.get(f.order_id);
                          const href = `/ordre/${f.order_id}/faktura`;
                          return (
                            <KlikkbarRad key={f.id} href={href}>
                              <td className="ordre-nr">{ordre?.order_no ?? ""}</td>
                              <td>
                                <Link className="lenke" href={href}>
                                  {ordre?.title ?? "Ordre"}
                                </Link>
                              </td>
                              <td className="muted">{f.transfer_order_no ?? ""}</td>
                              <td>
                                <span className={`pill ${fakturaPill(f.status)}`}>
                                  {INVOICE_DRAFT_STATUS_LABELS[f.status] ?? f.status}
                                </span>
                              </td>
                              <td className="num nowrap">{f.totals ? formatNok(Number(f.totals.total)) : "—"}</td>
                              <td className="num muted nowrap">{formatDate(f.created_at)}</td>
                            </KlikkbarRad>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
            </div>
          </div>
        )}
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
