"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPris } from "@/components/GrossistSok";
import {
  INVOICE_MATCH_LABELS,
  ORDER_STATUS_LABELS,
  formatNok,
  type OrderStatus,
  type SupplierInvoice,
  type SupplierInvoiceLine,
} from "@/lib/types";

interface OrdreValg {
  id: string;
  order_no: number;
  title: string;
  status: OrderStatus;
  customer_name: string;
}

/**
 * Lista over leverandørfakturaer, med linjene bak et klikk.
 *
 * En rad viser det man trenger for å avgjøre hvor fakturaen hører hjemme:
 * leverandør, beløp, og referansene grossisten skrev. Ukoblede får en
 * ordrevelger for hele fakturaen; ekspandert rad har én per linje, for
 * samlefakturaer der linjene går til hver sin jobb.
 */
export function FakturaListe({
  fakturaer,
  linjer,
  ordrar,
}: {
  fakturaer: SupplierInvoice[];
  linjer: SupplierInvoiceLine[];
  ordrar: OrdreValg[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordreAvId = new Map(ordrar.map((o) => [o.id, o]));
  const linjerPerFaktura = new Map<string, SupplierInvoiceLine[]>();
  for (const l of linjer) {
    const liste = linjerPerFaktura.get(l.invoice_id) ?? [];
    liste.push(l);
    linjerPerFaktura.set(l.invoice_id, liste);
  }

  async function kall(url: string, body?: unknown, nokkel?: string) {
    setBusy(nokkel ?? url);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Noe gikk galt");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      {error && <div className="banner error" style={{ margin: 16 }}>{error}</div>}
      {/* Tabell som i Go. Klikk på en rad viser linjene på fakturaen under
          den; handlingene til høyre har sin egen mening. */}
      <table className="table klikkbar tabell-mobil faktura-liste">
        <thead>
          <tr>
            <th aria-label="Vis linjer" style={{ width: 28 }} />
            <th>Dato</th>
            <th>Leverandør</th>
            <th>Faktura</th>
            <th>Referanser</th>
            <th className="num">Beløp eks. mva</th>
            <th>Status</th>
            <th>Ordre</th>
          </tr>
        </thead>
        {fakturaer.map((f) => {
          const kreditnota = /credit/i.test(f.voucher_type);
          const erOpen = open.has(f.id);
          const fLinjer = linjerPerFaktura.get(f.id) ?? [];
          const ordre = f.order_id ? ordreAvId.get(f.order_id) : null;
          const duplikat = Boolean(f.duplicate_of);
          // Uten linjer (ingen EHF) kobles hele fakturaen til ordren.
          const kanKople = !kreditnota && !duplikat && f.match_status !== "kopla" && f.match_status !== "ignorert";
          const detalj = duplikat
            ? "duplikat — samme faktura er alt lest fra " + (f.source === "regnskap" ? "grossistens fakturafil" : "regnskapssystemet")
            : f.line_count > 0
              ? `${f.line_count} linjer`
              : f.has_ehf
                ? ""
                : "ingen EHF";

          return (
            <tbody key={f.id} className={erOpen ? "open" : undefined}>
              <tr onClick={() => toggle(f.id)} aria-expanded={erOpen}>
                <td className="utvid" aria-hidden>
                  {erOpen ? "▾" : "▸"}
                </td>
                <td className="meta nowrap muted">{formatDag(f.voucher_date)}</td>
                <td className="hoved">
                  <div>{f.supplier_name ?? "(ukjent leverandør)"}</div>
                  <div className="tiny muted">
                    {[kjelde(f), detalj].filter(Boolean).join(" · ")}
                    {f.parse_error && ` · kunne ikke lese fakturaen: ${f.parse_error}`}
                  </div>
                </td>
                <td className="meta nowrap">
                  {kreditnota ? "Kreditnota" : "Faktura"} {f.invoice_no ?? f.voucher_no ?? ""}
                  <div className="tiny muted">
                    {f.voucher_no ? `bilag ${f.voucher_no}` : ""}
                    {f.account_numbers.length > 0 && ` · konto ${f.account_numbers.join(", ")}`}
                    {f.pdf_storage_path && (
                      <>
                        {" · "}
                        <a
                          href={`/api/regnskap/fakturaer/${f.id}/pdf`}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: "underline" }}
                        >
                          Åpne PDF
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="meta">
                  {f.references_found.length > 0 && (
                    <div className="chips" style={{ marginTop: 0 }}>
                      {f.references_found.slice(0, 4).map((r) => (
                        <span key={r} className="chip" title="Referanse funnet på fakturaen">
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="num nowrap belop">
                  <strong>{f.net_amount === null ? "—" : formatNok(Number(f.net_amount))}</strong>
                </td>
                <td className="meta">
                  <span
                    className={`pill ${
                      f.match_status === "kopla" ? "ferdig" : f.match_status === "delvis" ? "paagaar" : f.match_status === "ignorert" ? "avbrutt" : "opna"
                    }`}
                  >
                    {duplikat ? "Duplikat" : kreditnota && f.match_status === "ukopla" ? "Håndteres manuelt" : INVOICE_MATCH_LABELS[f.match_status]}
                  </span>
                </td>
                <td className="handling" onClick={(e) => e.stopPropagation()}>
                  <div className="celle-knapper">
                    {duplikat ? null : ordre ? (
                      <Link className="button secondary" href={`/ordre/${ordre.id}`}>
                        #{ordre.order_no} →
                      </Link>
                    ) : (
                      kanKople && (
                        <OrdreVelger
                          ordrar={ordrar}
                          busy={busy === `f:${f.id}`}
                          onVelg={(orderId) =>
                            kall(`/api/regnskap/fakturaer/${f.id}/kople`, { order_id: orderId }, `f:${f.id}`)
                          }
                        />
                      )
                    )}
                    {duplikat ? null : f.match_status === "ignorert" ? (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={busy !== null}
                        onClick={() => kall(`/api/regnskap/fakturaer/${f.id}/angre-ignorer`, {}, `i:${f.id}`)}
                      >
                        Angre ignorer
                      </button>
                    ) : f.matched_line_count === 0 && !f.order_id ? (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={busy !== null}
                        onClick={() => kall(`/api/regnskap/fakturaer/${f.id}/ignorer`, {}, `i:${f.id}`)}
                      >
                        Ignorer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={busy !== null}
                        onClick={() => {
                          if (window.confirm("Løse alle linjene fra ordren? Materiellet som kom fra fakturaen fjernes.")) {
                            kall(`/api/regnskap/fakturaer/${f.id}/loys`, {}, `l:${f.id}`);
                          }
                        }}
                      >
                        Løs fra ordre
                      </button>
                    )}
                  </div>
                </td>
              </tr>

              {erOpen && (
                <tr className="faktura-detalj">
                  <td colSpan={8}>
                    <div className="faktura-linjer">
                      {ordre && ordre.status === "fakturert" && (
                        <div className="banner warning" style={{ margin: "0 0 10px" }}>
                          Ordre #{ordre.order_no} er allerede fakturert. Linjene er koblet, men det er ikke laget materiell — se på dem.
                        </div>
                      )}
                      {fLinjer.length === 0 ? (
                        <p className="muted tiny" style={{ margin: 0 }}>
                          {duplikat
                            ? "Linjene ligger på originalen — denne er bare registrert, så den ikke gir dobbelt materiell."
                            : f.has_ehf
                              ? "Ingen linjer lest."
                              : "Fakturaen kom uten EHF — bare hodet finnes i regnskapssystemet."}
                          {ordre && " Koblet til ordren som helhet; beløpet er ikke ført som materiell."}
                        </p>
                      ) : (
                        <table className="doc-table">
                          <thead>
                            <tr>
                              <th>Elnr</th>
                              <th>Vare</th>
                              <th className="num">Mengde</th>
                              <th className="num">Pris</th>
                              <th className="num">Sum</th>
                              <th>Ordre</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fLinjer.map((l) => {
                              const lo = l.order_id ? ordreAvId.get(l.order_id) : null;
                              return (
                                <tr key={l.id}>
                                  <td className="tiny muted">{l.item_no ?? "—"}</td>
                                  <td>
                                    {l.name}
                                    {l.order_reference && <span className="tiny muted"> · ref {l.order_reference}</span>}
                                  </td>
                                  <td className="num">
                                    {Number(l.quantity).toLocaleString("nb-NO")} {l.unit}
                                  </td>
                                  <td className="num">{formatPris(Number(l.unit_price))}</td>
                                  <td className="num">{formatNok(Number(l.line_total))}</td>
                                  <td>
                                    {l.status === "kopla" && lo ? (
                                      <span className="row">
                                        <Link className="lenke-bla" href={`/ordre/${lo.id}`}>
                                          #{lo.order_no}
                                        </Link>
                                        <button
                                          type="button"
                                          className="linkish"
                                          disabled={busy !== null}
                                          onClick={() => kall(`/api/regnskap/fakturaer/${f.id}/loys`, { line_id: l.id }, `l:${l.id}`)}
                                        >
                                          løs
                                        </button>
                                      </span>
                                    ) : kreditnota ? (
                                      <span className="tiny muted">manuelt</span>
                                    ) : f.match_status === "ignorert" ? (
                                      <span className="tiny muted">ignorert</span>
                                    ) : (
                                      <OrdreVelger
                                        ordrar={ordrar}
                                        kompakt
                                        busy={busy === `l:${l.id}`}
                                        onVelg={(orderId) =>
                                          kall(
                                            `/api/regnskap/fakturaer/${f.id}/kople`,
                                            { lines: [{ line_id: l.id, order_id: orderId }] },
                                            `l:${l.id}`,
                                          )
                                        }
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </>
  );
}

/**
 * Ordrevelger: skriv nummer eller tittel, trykk på treffet. Ordrene er
 * allerede lastet — det er sjelden mer enn noen hundre åpne.
 */
function OrdreVelger({
  ordrar,
  onVelg,
  busy,
  kompakt = false,
}: {
  ordrar: OrdreValg[];
  onVelg: (orderId: string) => void;
  busy: boolean;
  kompakt?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const treff = q.trim()
    ? ordrar
        .filter((o) => {
          const s = q.trim().toLowerCase();
          return (
            String(o.order_no).startsWith(s.replace("#", "")) ||
            o.title.toLowerCase().includes(s) ||
            o.customer_name.toLowerCase().includes(s)
          );
        })
        .slice(0, 8)
    : ordrar.slice(0, 8);

  if (!open) {
    return (
      <button
        type="button"
        className={kompakt ? "linkish" : "button secondary"}
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        {busy ? "Kobler…" : "Velg ordre"}
      </button>
    );
  }

  return (
    <span className="ordre-velger">
      <input
        className="input"
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="#1042 eller tittel"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && treff.length === 1) {
            onVelg(treff[0].id);
            setOpen(false);
          }
        }}
      />
      <span className="ordre-velger-treff">
        {treff.length === 0 && <span className="tiny muted" style={{ padding: 8 }}>Ingen treff</span>}
        {treff.map((o) => (
          <button
            key={o.id}
            type="button"
            className="ordre-velger-rad"
            onClick={() => {
              onVelg(o.id);
              setOpen(false);
            }}
          >
            <span className="ordre-nr">#{o.order_no}</span>
            <span className="lead-main">
              <span style={{ display: "block", fontWeight: 550 }}>{o.title}</span>
              <span className="tiny muted">
                {o.customer_name || "(ingen kunde)"} · {ORDER_STATUS_LABELS[o.status]}
              </span>
            </span>
          </button>
        ))}
      </span>
      <button type="button" className="button ghost" onClick={() => setOpen(false)}>
        ×
      </button>
    </span>
  );
}

/** «PowerOffice Go» eller «Onninen (FTP)». */
function kjelde(f: SupplierInvoice): string {
  if (f.source === "ftp") return `${f.supplier_name ?? "Grossist"} (FTP)`;
  return f.provider === "tripletex" ? "Tripletex" : "PowerOffice Go";
}

/** «2026-09-12» → «12.09». */
function formatDag(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}
