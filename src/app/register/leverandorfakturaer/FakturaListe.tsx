"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

interface LagerValg {
  id: string;
  location_no: number;
  name: string;
  active: boolean;
}

/** Det en faktura eller en linje kan kobles til: en ordre, eller en bil. */
type Koplemaal = { order_id: string } | { stock_location_id: string };

/**
 * Lista over leverandørfakturaer, med linjene bak et klikk.
 *
 * En rad viser det man trenger for å avgjøre hvor fakturaen hører hjemme:
 * leverandør, beløp, og referansene grossisten skrev. Ukoblede får en
 * ordrevelger for hele fakturaen; ekspandert rad har én per linje, for
 * samlefakturaer der linjene går til hver sin jobb.
 *
 * Velgeren har også bilene: varer kjøpt inn til bilen kobles dit, og går
 * inn i bilens beholdning i stedet for på en ordre.
 */
export function FakturaListe({
  fakturaer,
  linjer,
  ordrar,
  lager = [],
}: {
  fakturaer: SupplierInvoice[];
  linjer: SupplierInvoiceLine[];
  ordrar: OrdreValg[];
  lager?: LagerValg[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordreAvId = new Map(ordrar.map((o) => [o.id, o]));
  const lagerAvId = new Map(lager.map((l) => [l.id, l]));
  const aktiveLager = lager.filter((l) => l.active);
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
          const bil = f.stock_location_id ? lagerAvId.get(f.stock_location_id) : null;
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
                    ) : bil ? (
                      <Link className="button secondary" href={`/register/lager/${bil.id}`}>
                        {bil.name} →
                      </Link>
                    ) : (
                      kanKople && (
                        <OrdreVelger
                          ordrar={ordrar}
                          lager={aktiveLager}
                          busy={busy === `f:${f.id}`}
                          onVelg={(maal) => kall(`/api/regnskap/fakturaer/${f.id}/kople`, maal, `f:${f.id}`)}
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
                    ) : f.matched_line_count === 0 && !f.order_id && !f.stock_location_id ? (
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
                          if (
                            window.confirm(
                              bil
                                ? `Løse alle linjene fra ${bil.name}? Varene går ut av beholdningen igjen.`
                                : "Løse alle linjene? Materiell og varer i bil som kom fra fakturaen fjernes.",
                            )
                          ) {
                            kall(`/api/regnskap/fakturaer/${f.id}/loys`, {}, `l:${f.id}`);
                          }
                        }}
                      >
                        {bil ? "Løs fra bil" : "Løs fra ordre"}
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
                          {bil && ` Koblet til ${bil.name} som helhet; ingen varer er lagt i beholdningen.`}
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
                              <th>Ordre eller bil</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fLinjer.map((l) => {
                              const lo = l.order_id ? ordreAvId.get(l.order_id) : null;
                              const lb = l.stock_location_id ? lagerAvId.get(l.stock_location_id) : null;
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
                                    ) : l.status === "kopla" && lb ? (
                                      <span className="row">
                                        <Link className="lenke-bla" href={`/register/lager/${lb.id}`}>
                                          {lb.name}
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
                                        lager={aktiveLager}
                                        kompakt
                                        busy={busy === `l:${l.id}`}
                                        onVelg={(maal) =>
                                          kall(
                                            `/api/regnskap/fakturaer/${f.id}/kople`,
                                            { lines: [{ line_id: l.id, ...maal }] },
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
/**
 * Oppslagsfeltet for ordren, som i Go: alltid synlig. Klikk eller skriv, så
 * kommer ordrene; ordrenummer, tittel eller kunde snevrer inn. Piltaster og
 * Enter velger, Escape eller klikk utenfor lukker.
 */
function OrdreVelger({
  ordrar,
  lager,
  onVelg,
  busy,
  kompakt = false,
}: {
  ordrar: OrdreValg[];
  /** Bilene som tar imot varer. Står øverst: de er få, og søkes opp på nummer eller navn. */
  lager: LagerValg[];
  onVelg: (maal: Koplemaal) => void;
  busy: boolean;
  kompakt?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const rot = useRef<HTMLSpanElement>(null);
  const felt = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function lukk(e: MouseEvent) {
      if (!rot.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", lukk);
    return () => document.removeEventListener("mousedown", lukk);
  }, [open]);

  const s = q.trim().toLowerCase().replace(/^#/, "");
  // Én liste for piltastene: bilene først, så ordrene.
  type Treff = { type: "bil"; bil: LagerValg } | { type: "ordre"; ordre: OrdreValg };
  const bilTreff: Treff[] = (
    s ? lager.filter((l) => String(l.location_no).startsWith(s) || l.name.toLowerCase().includes(s)) : lager
  )
    .slice(0, 4)
    .map((bil) => ({ type: "bil", bil }));
  const ordreTreff: Treff[] = (
    s
      ? ordrar.filter(
          (o) => String(o.order_no).startsWith(s) || o.title.toLowerCase().includes(s) || o.customer_name.toLowerCase().includes(s),
        )
      : ordrar
  )
    .slice(0, 8)
    .map((ordre) => ({ type: "ordre", ordre }));
  const treff = [...bilTreff, ...ordreTreff];

  function velg(t: Treff) {
    onVelg(t.type === "bil" ? { stock_location_id: t.bil.id } : { order_id: t.ordre.id });
    setOpen(false);
    setQ("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setAktiv((a) => (treff.length ? (a + 1) % treff.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktiv((a) => (treff.length ? (a - 1 + treff.length) % treff.length : 0));
    } else if (e.key === "Enter" && open && treff[aktiv]) {
      e.preventDefault();
      velg(treff[aktiv]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <span className={`ordre-velger picker${kompakt ? " kompakt" : ""}`} ref={rot}>
      <input
        ref={felt}
        className="input"
        value={busy ? "Kobler…" : q}
        disabled={busy}
        placeholder={lager.length ? "Velg ordre eller bil" : "Velg ordre"}
        title="Søk på ordrenummer, tittel, kunde eller bil"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setAktiv(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="kunde-velger-pil"
        tabIndex={-1}
        aria-label="Vis ordrene"
        disabled={busy}
        onClick={() => {
          setOpen((o) => !o);
          felt.current?.focus();
        }}
      >
        ▾
      </button>
      {open && (
        <span className="ordre-velger-treff" role="listbox">
          {treff.length === 0 && <span className="tiny muted" style={{ padding: 8 }}>Ingen ordrer passer</span>}
          {treff.map((t, i) => (
            <button
              key={t.type === "bil" ? t.bil.id : t.ordre.id}
              type="button"
              role="option"
              aria-selected={i === aktiv}
              className={`ordre-velger-rad${i === aktiv ? " active" : ""}`}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => velg(t)}
            >
              <span className="ordre-nr">#{t.type === "bil" ? t.bil.location_no : t.ordre.order_no}</span>
              <span className="lead-main">
                <span style={{ display: "block", fontWeight: 550 }}>{t.type === "bil" ? t.bil.name : t.ordre.title}</span>
                <span className="tiny muted">
                  {t.type === "bil"
                    ? "Bil eller lager · varene går i beholdningen"
                    : `${t.ordre.customer_name || "(ingen kunde)"} · ${ORDER_STATUS_LABELS[t.ordre.status]}`}
                </span>
              </span>
            </button>
          ))}
        </span>
      )}
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
