import Link from "next/link";
import { notFound } from "next/navigation";
import { OrdreBeskrivelse } from "./OrdreBeskrivelse";
import { OrdreKunde } from "./OrdreKunde";
import { hentOrdre } from "@/lib/ordre/hent";
import { summerMateriell, summerTimar } from "@/lib/ordre/summering";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ORDER_STATUS_LABELS,
  QUOTE_TYPE_LABELS,
  computeTotals,
  formatDate,
  formatNok,
  harRabatt,
  lineDiscount,
  lineTotal,
  type MaterialEntry,
  type OrderEvent,
  type OrderStatus,
  type TimeEntry,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdreSide({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();
  const supabase = await supabaseServer();

  const [{ data: hendelser }, { data: timar }, { data: materiell }] = await Promise.all([
    supabase
      .from("order_events")
      .select("*")
      .eq("order_id", ordre.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("time_entries")
      .select("hours, unit_price, time_type_name")
      .eq("order_id", ordre.id),
    supabase
      .from("material_entries")
      .select("quantity, cost_price, sale_price")
      .eq("order_id", ordre.id),
  ]);

  // Tallgrunnlaget fakturaforslaget skal lese i steg 4. Samme funksjoner
  // som fanene bruker, så tallene her og der aldri spriker.
  const timesum = summerTimar((timar ?? []) as TimeEntry[]);
  const materiellsum = summerMateriell((materiell ?? []) as MaterialEntry[]);

  const snapshot = ordre.quote_snapshot;
  const document = snapshot?.document ?? null;
  const totals = document ? computeTotals(document) : snapshot?.totals ?? null;
  const visRabatt = document ? harRabatt(document) : false;

  return (
    <>
      <div className="stack">
        <div className="card card-pad">
          <span className="label">Oppsummering</span>
          <div className="oppsummering">
            <div className="oppsummering-post">
              <span className="tiny muted">Planlagt (tilbud)</span>
              <strong>
                {ordre.planned_total === null ? "—" : formatNok(Number(ordre.planned_total))}
              </strong>
              <span className="tiny muted">
                {snapshot?.quote_type === "tid_og_materiell" ? "tid og materiell" : "eks. mva"}
              </span>
            </div>
            <Link href={`/ordre/${ordre.id}/timer`} className="oppsummering-post clickable">
              <span className="tiny muted">Timer</span>
              <strong>{formatNok(timesum.kr)}</strong>
              <span className="tiny muted">{formatTimar(timesum.timar)} ført →</span>
            </Link>
            <Link href={`/ordre/${ordre.id}/materiell`} className="oppsummering-post clickable">
              <span className="tiny muted">Materiell</span>
              <strong>{formatNok(materiellsum.sal)}</strong>
              <span className="tiny muted">
                {materiellsum.linjer} {materiellsum.linjer === 1 ? "linje" : "linjer"} · kost{" "}
                {formatNok(materiellsum.kost)} →
              </span>
            </Link>
            <div className="oppsummering-post">
              <span className="tiny muted">Timer + materiell</span>
              <strong>{formatNok(timesum.kr + materiellsum.sal)}</strong>
              <span className="tiny muted">salg eks. mva</span>
            </div>
          </div>
        </div>

        <OrdreBeskrivelse
          orderId={ordre.id}
          description={ordre.description}
          source={ordre.description_source}
        />

        <OrdreKunde
          orderId={ordre.id}
          kunde={{
            customer_name: ordre.customer_name,
            customer_contact: ordre.customer_contact,
            customer_email: ordre.customer_email,
            customer_phone: ordre.customer_phone,
            site_address: ordre.site_address,
          }}
        />

        {snapshot && (
          <div className="card card-pad">
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="label" style={{ marginBottom: 0 }}>
                Grunnlag fra tilbudet
              </span>
              <span className="tiny muted">{QUOTE_TYPE_LABELS[snapshot.quote_type]}</span>
            </div>

            {snapshot.quote_type === "tid_og_materiell" || !document ? (
              <p className="muted" style={{ margin: 0 }}>
                Tid og materiell — timer og materiell føres på ordren.
              </p>
            ) : (
              <>
                {document.sections.map((section, i) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div className="tiny muted" style={{ fontWeight: 600, marginTop: 6 }}>
                      {section.title}
                    </div>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Beskrivelse</th>
                          <th className="num">Antall</th>
                          <th>Enhet</th>
                          <th className="num">Pris</th>
                          {visRabatt && <th className="num">Rabatt</th>}
                          <th className="num">Sum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.lines.map((line, j) => (
                          <tr key={j}>
                            <td>{line.description}</td>
                            <td className="num">{line.quantity}</td>
                            <td>{line.unit}</td>
                            <td className="num">{formatNok(line.unit_price)}</td>
                            {visRabatt && (
                              <td className="num">
                                {lineDiscount(line) > 0 ? `${lineDiscount(line)} %` : ""}
                              </td>
                            )}
                            <td className="num">{formatNok(lineTotal(line))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
                {totals && (
                  <div className="row-between tiny muted" style={{ marginTop: 4 }}>
                    <span>Sum eks. mva</span>
                    <strong style={{ color: "var(--text)", fontSize: 14 }}>
                      {formatNok(totals.subtotal)}
                    </strong>
                  </div>
                )}
                <span className="hint">
                  Slik tilbudet var da ordren ble opprettet. Endringer i tilbudet etterpå
                  vises ikke her.
                </span>
              </>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="label" style={{ marginBottom: 0 }}>
              Hendelser
            </span>
          </div>
          {(hendelser ?? []).length === 0 ? (
            <div className="empty">Ingen hendelser ennå.</div>
          ) : (
            <div className="lead-list">
              {((hendelser ?? []) as OrderEvent[]).map((h) => (
                <div key={h.id} className="lead-row">
                  <div className="lead-main">{hendelseTekst(h)}</div>
                  <span className="lead-time">{formatDate(h.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 7,5 timer → «7,5 t». */
function formatTimar(t: number): string {
  return `${t.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} t`;
}

/** «opna → paagaar» i loggen blir «Åpen → Pågår» på skjermen. */
function hendelseTekst(h: OrderEvent): string {
  if (h.kind === "oppretta") return `Opprettet${h.note ? ` — ${h.note.toLowerCase()}` : ""}`;
  if (h.kind === "status" && h.note) {
    const [fra, til] = h.note.split("→").map((s) => s.trim()) as OrderStatus[];
    const navn = (s: OrderStatus) => ORDER_STATUS_LABELS[s] ?? s;
    return `Status: ${navn(fra)} → ${navn(til)}`;
  }
  if (h.kind === "redigert") return `Redigert${h.note ? ` — ${h.note}` : ""}`;
  return h.note ?? h.kind;
}
