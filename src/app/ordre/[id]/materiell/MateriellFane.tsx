"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GrossistSok, formatPris, type GrossistTreff } from "@/components/GrossistSok";
import { salspris, summerMateriell } from "@/lib/ordre/summering";
import { formatNok, type MaterialEntry } from "@/lib/types";

export interface FakturaInfo {
  invoice_id: string;
  invoice_no: string;
  supplier_name: string | null;
  voucher_date: string | null;
}

/** Faktura koblet til ordren som helhet — uten linjer å føre. */
export interface HodeFaktura {
  id: string;
  invoice_no: string | null;
  voucher_no: number | null;
  voucher_type: string;
  supplier_name: string | null;
  voucher_date: string | null;
  net_amount: number | null;
  has_ehf: boolean;
  parse_error: string | null;
}

/**
 * Materiell på ordren.
 *
 * Søk i katalogen, trykk på varen, oppgi mengde — kostpris og påslag
 * kommer av seg selv. Påslaget er selskapets standard, og kan overstyres
 * her før linja legges til, eller på linja etterpå. Fritekstlinja er for
 * det som ikke står i noen katalog: en vare fra byggevarehuset, en
 * leiebil.
 *
 * Prisene i lista er per enhet; linjesummen er mengde × salgspris. Summen
 * nederst er den Oversikt og fakturaforslaget leser.
 */
export function MateriellFane({
  orderId,
  laast,
  entries,
  standardPaaslag,
  harKatalog,
  fakturaInfo = {},
  hodeFakturaer = [],
}: {
  orderId: string;
  laast: boolean;
  entries: MaterialEntry[];
  standardPaaslag: number;
  harKatalog: boolean;
  /** Per invoice_line_id: fakturaen linja kom fra. */
  fakturaInfo?: Record<string, FakturaInfo>;
  /** Fakturaer koblet på hodenivå (ingen EHF, ingen linjer). */
  hodeFakturaer?: HodeFaktura[];
}) {
  const router = useRouter();
  const [valgt, setValgt] = useState<GrossistTreff | null>(null);
  const [mengde, setMengde] = useState("1");
  const [paaslag, setPaaslag] = useState(String(standardPaaslag));
  const [fritekst, setFritekst] = useState(false);
  const [fri, setFri] = useState({ name: "", unit: "stk", quantity: "1", sale_price: "", cost_price: "" });
  const [redigerPaaslag, setRedigerPaaslag] = useState<{ id: string; verdi: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sum = summerMateriell(entries);
  const fraFaktura = entries.filter((e) => e.invoice_line_id);
  const manuelle = entries.filter((e) => !e.invoice_line_id);
  const entryAvId = new Map(entries.map((e) => [e.id, e]));
  const kostValgt = valgt ? (valgt.net_price_per_unit ?? valgt.list_price_per_unit) : 0;
  const salValgt = salspris(kostValgt, tal(paaslag) ?? standardPaaslag);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/materiell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke legge til");
      setValgt(null);
      setMengde("1");
      setPaaslag(String(standardPaaslag));
      setFritekst(false);
      setFri({ name: "", unit: "stk", quantity: "1", sale_price: "", cost_price: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/materiell/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      setRedigerPaaslag(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loys(e: MaterialEntry) {
    const info = e.invoice_line_id ? fakturaInfo[e.invoice_line_id] : null;
    if (!info || !e.invoice_line_id) return;
    if (!window.confirm(`Løse «${e.name}» fra ordren? Linja går tilbake til fakturaen som ukoblet.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/regnskap/fakturaer/${info.invoice_id}/loys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_id: e.invoice_line_id }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke løse");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function loysFaktura(f: HodeFaktura) {
    if (!window.confirm(`Løse faktura ${f.invoice_no ?? f.voucher_no ?? ""} fra ordren? Den blir liggende som ukoblet under Leverandørfakturaer.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/regnskap/fakturaer/${f.id}/loys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke løse");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function slett(e: MaterialEntry) {
    if (!window.confirm(`Slette «${e.name}»?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/materiell/${e.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Én linje i lista. Fakturalinjer er låst i mengde og kost; erstattede er nedtonet. */
  function rad(e: MaterialEntry) {
    const kost = e.cost_price === null ? null : Number(e.cost_price);
    const sal = Number(e.sale_price);
    const q = Number(e.quantity);
    const info = e.invoice_line_id ? fakturaInfo[e.invoice_line_id] : null;
    const erstattaAv = e.replaced_by ? entryAvId.get(e.replaced_by) : null;
    const erstattaInfo = erstattaAv?.invoice_line_id ? fakturaInfo[erstattaAv.invoice_line_id] : null;
    const erstatta = Boolean(e.replaced_by);
    const fakturert = Boolean(e.invoice_draft_id);

    return (
      <div key={e.id} className={`lead-row materiell-rad${erstatta ? " erstatta" : ""}${fakturert ? " fakturert" : ""}`}>
        <span className="ordre-nr">{e.item_no ?? "—"}</span>
        <div className="lead-main">
          <div className="lead-subject" style={{ cursor: "default" }}>
            {e.name}
            {fakturert && <span className="chip fakturert-merke">fakturert</span>}
          </div>
          <div className="lead-meta">
            {q.toLocaleString("nb-NO")} {e.unit} × {formatPris(sal)}
            {kost !== null && ` · kost ${formatPris(kost)}`}
            {!info && e.note && ` · ${e.note}`}
          </div>
          {info && (
            <div className="chips">
              <span className="chip faktura">
                Faktura {info.invoice_no}
                {info.supplier_name && ` · ${info.supplier_name}`}
                {info.voucher_date && ` · ${formatDag(info.voucher_date)}`}
              </span>
            </div>
          )}
          {erstatta && (
            <div className="tiny" style={{ color: "var(--warning)", marginTop: 3 }}>
              Erstattet av faktura{erstattaInfo ? ` ${erstattaInfo.invoice_no}` : ""} — teller ikke i summen.
            </div>
          )}
        </div>
        <span className="materiell-paaslag">
          {redigerPaaslag?.id === e.id ? (
            <form
              className="row"
              onSubmit={(ev) => {
                ev.preventDefault();
                patch(e.id, { markup_pct: redigerPaaslag.verdi });
              }}
            >
              <input
                className="input"
                inputMode="decimal"
                value={redigerPaaslag.verdi}
                onChange={(ev) => setRedigerPaaslag({ id: e.id, verdi: ev.target.value })}
                style={{ width: 72 }}
                autoFocus
              />
              <button className="button" type="submit">
                OK
              </button>
              <button type="button" className="button ghost" onClick={() => setRedigerPaaslag(null)}>
                ×
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="linkish"
              disabled={laast || kost === null || erstatta || fakturert}
              title={kost === null ? "Fritekstlinje uten kostpris" : "Trykk for å overstyre påslaget"}
              onClick={() => setRedigerPaaslag({ id: e.id, verdi: String(Number(e.markup_pct)) })}
            >
              {Number(e.markup_pct).toLocaleString("nb-NO")} %
            </button>
          )}
        </span>
        <span className="ordre-sum">
          <strong>{formatNok(q * sal)}</strong>
        </span>
        {!laast && !erstatta && !fakturert && (
          info ? (
            <button type="button" className="button ghost" onClick={() => loys(e)}>
              Løs fra ordre
            </button>
          ) : (
            <button type="button" className="button ghost" onClick={() => slett(e)}>
              Slett
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <div className="stack fane-mobil">
      {!laast && (
        <div className="card card-pad">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="label" style={{ marginBottom: 0 }}>
              Legg til materiell
            </span>
            <button
              type="button"
              className="button ghost"
              onClick={() => {
                setFritekst((v) => !v);
                setValgt(null);
              }}
            >
              {fritekst ? "Søk i katalogen" : "Fritekstlinje"}
            </button>
          </div>
          {error && <div className="banner error">{error}</div>}
          {!harKatalog && !fritekst && (
            <div className="banner info">
              Ingen grossistkatalog ennå — bruk fritekstlinje, eller send prisfilen til Devello.
            </div>
          )}

          {fritekst ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                post({
                  name: fri.name,
                  unit: fri.unit,
                  quantity: fri.quantity,
                  sale_price: fri.sale_price || undefined,
                  cost_price: fri.cost_price || undefined,
                });
              }}
            >
              <div className="grid-2">
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="label">Vare</span>
                  <input
                    className="input"
                    value={fri.name}
                    onChange={(e) => setFri({ ...fri, name: e.target.value })}
                    placeholder="Byggevarehus: gipsplate 12 mm"
                    autoFocus
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">Mengde</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={fri.quantity}
                    onChange={(e) => setFri({ ...fri, quantity: e.target.value })}
                    required
                  />
                </label>
                <label className="field">
                  <span className="label">Enhet</span>
                  <input
                    className="input"
                    value={fri.unit}
                    onChange={(e) => setFri({ ...fri, unit: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="label">Kostpris per enhet (valgfritt)</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={fri.cost_price}
                    onChange={(e) => setFri({ ...fri, cost_price: e.target.value })}
                    placeholder="Regner salgspris med påslag"
                  />
                </label>
                <label className="field">
                  <span className="label">Salgspris per enhet eks. mva</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={fri.sale_price}
                    onChange={(e) => setFri({ ...fri, sale_price: e.target.value })}
                    placeholder={fri.cost_price ? `${salspris(tal(fri.cost_price) ?? 0, standardPaaslag)}` : "Påkrevd uten kostpris"}
                  />
                </label>
              </div>
              <button className="button" type="submit" disabled={busy || !fri.name || (!fri.sale_price && !fri.cost_price)}>
                {busy ? "Legger til…" : "Legg til"}
              </button>
            </form>
          ) : (
            <>
              <GrossistSok
                onVelg={(t) => {
                  setValgt(t);
                  setMengde("1");
                  setPaaslag(String(standardPaaslag));
                }}
                autoFocus
              />
              {valgt && (
                <form
                  className="valgt-vare"
                  onSubmit={(e) => {
                    e.preventDefault();
                    post({ supplier_item_id: valgt.id, quantity: mengde, markup_pct: paaslag });
                  }}
                >
                  <div className="row-between">
                    <div>
                      <strong>{valgt.name}</strong>
                      <div className="tiny muted">
                        {valgt.item_no} · {valgt.supplier_name} · kost {formatPris(kostValgt)}/{valgt.unit}
                      </div>
                    </div>
                    <button type="button" className="button ghost" onClick={() => setValgt(null)}>
                      ×
                    </button>
                  </div>
                  <div className="grid-2" style={{ marginTop: 12 }}>
                    <label className="field">
                      <span className="label">Mengde ({valgt.unit})</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={mengde}
                        onChange={(e) => setMengde(e.target.value)}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        required
                      />
                    </label>
                    <label className="field">
                      <span className="label">Påslag (%)</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={paaslag}
                        onChange={(e) => setPaaslag(e.target.value)}
                      />
                      <span className="hint">
                        Salgspris {formatPris(salValgt)}/{valgt.unit}
                        {tal(paaslag) !== standardPaaslag && ` — standard er ${standardPaaslag} %`}
                      </span>
                    </label>
                  </div>
                  <button className="button" type="submit" disabled={busy}>
                    {busy ? "Legger til…" : `Legg til — ${formatNok(salValgt * (tal(mengde) ?? 0))}`}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {hodeFakturaer.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="label" style={{ marginBottom: 0 }}>
              Leverandørfakturaer uten linjer
            </span>
            <Link href="/ordre/leverandorfakturaer" className="tiny">
              Alle leverandørfakturaer →
            </Link>
          </div>
          <div className="card-pad tiny muted" style={{ paddingTop: 0 }}>
            Regnskapssystemet har bare fakturahodet for disse — ingen EHF, så ingen linjer å føre.
            Beløpet er ikke med i materiellsummen. Før varene manuelt under om de skal på fakturaen til kunden.
          </div>
          <div className="lead-list">
            {hodeFakturaer.map((f) => (
              <div key={f.id} className="lead-row">
                <div className="lead-main">
                  <div className="lead-subject" style={{ cursor: "inherit" }}>
                    {f.supplier_name ?? "(ukjent leverandør)"}
                    {" · "}
                    {/credit/i.test(f.voucher_type) ? "Kreditnota" : "Faktura"} {f.invoice_no ?? f.voucher_no ?? ""}
                  </div>
                  <div className="lead-meta">
                    {f.voucher_date ? formatDag(f.voucher_date) : "—"}
                    {f.has_ehf ? (f.parse_error ? ` · kunne ikke lese EHF: ${f.parse_error}` : " · EHF uten linjer") : " · ingen EHF"}
                  </div>
                </div>
                <span className="ordre-sum">
                  <strong>{f.net_amount === null ? "—" : formatNok(Number(f.net_amount))}</strong>
                  <span className="tiny muted"> eks. mva</span>
                </span>
                {!laast && (
                  <button type="button" className="linkish" onClick={() => loysFaktura(f)}>
                    Løs fra ordre
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="label" style={{ marginBottom: 0 }}>
            Materiell på ordren
          </span>
          <span className="tiny muted">
            kost {formatNok(sum.kost)} · salg {formatNok(sum.sal)}
          </span>
        </div>
        {laast && error && <div className="banner error" style={{ margin: 16 }}>{error}</div>}

        {entries.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen materiell ført</div>
            <div>{laast ? "Ordren er avsluttet." : "Søk opp en vare over, eller legg til en fritekstlinje."}</div>
          </div>
        ) : (
          <>
            {fraFaktura.length > 0 && (
              <>
                <div className="dato-skille">Fra leverandørfakturaer</div>
                <div className="lead-list">{fraFaktura.map((e) => rad(e))}</div>
                {manuelle.length > 0 && <div className="dato-skille">Ført manuelt</div>}
              </>
            )}
            <div className="lead-list">{manuelle.map((e) => rad(e))}</div>
          </>
        )}

        {entries.length > 0 && (
          <div className="card-pad" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="row-between tiny" style={{ padding: "3px 0" }}>
              <span className="muted">
                Sum kost
                {sum.fraFaktura > 0 && ` · ${sum.fraFaktura} ${sum.fraFaktura === 1 ? "linje" : "linjer"} fra faktura`}
                {sum.erstatta > 0 && ` · ${sum.erstatta} erstattet`}
              </span>
              <span>{formatNok(sum.kost)}</span>
            </div>
            <div className="row-between" style={{ marginTop: 6, fontWeight: 600 }}>
              <span>Sum salg eks. mva</span>
              <span>{formatNok(sum.sal)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** «2026-09-12» → «12.09». */
function formatDag(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function tal(s: string): number | null {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}
