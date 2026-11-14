"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GrossistSok, formatPris, type GrossistTreff } from "@/components/GrossistSok";
import { Modal } from "@/components/Modal";
import type { Lagervare } from "@/lib/lager/behaldning";
import { formatNok, type StockLocation, type StockMovement } from "@/lib/types";
import { LagerSkjema } from "../LagerSkjema";

const TYPE_TEKST: Record<StockMovement["kind"], string> = {
  inn: "Inn",
  uttak: "Uttak",
  justering: "Telling",
};

/**
 * Én bil: beholdningen, og alt som har gått inn og ut.
 *
 * Varer kommer inn på tre måter: fra en leverandørfaktura merket med bilens
 * nummer, for hånd her (påfyll fra hovedlageret, eller det som lå i bilen
 * da den ble opprettet), og som rettelse når noen teller. De går ut når en
 * montør fører materiell «fra bil» på en ordre — aldri herfra.
 *
 * «Tell» setter beholdningen til det som faktisk ligger der. Forskjellen
 * lagres som en egen bevegelse, så det går an å se hva som ble rettet.
 */
export function LagerSide({
  lager,
  varer,
  verdi,
  historikk,
  fleireRoersler,
  medlemmer,
  harKatalog,
  meg,
}: {
  lager: StockLocation;
  varer: Lagervare[];
  verdi: number;
  /** Nyeste først. */
  historikk: StockMovement[];
  fleireRoersler: boolean;
  medlemmer: { id: string; navn: string }[];
  harKatalog: boolean;
  meg: { id: string; erAdmin: boolean };
}) {
  const router = useRouter();
  const [valgt, setValgt] = useState<GrossistTreff | null>(null);
  const [mengde, setMengde] = useState("1");
  const [fritekst, setFritekst] = useState(false);
  const [fri, setFri] = useState({ name: "", item_no: "", unit: "stk", quantity: "1", cost_price: "" });
  const [teller, setTeller] = useState<{ key: string; verdi: string } | null>(null);
  const [endrer, setEndrer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navn = new Map(medlemmer.map((m) => [m.id, m.navn]));
  const minus = varer.filter((v) => v.quantity < 0).length;

  async function kall(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Noe gikk galt");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function leggInn(body: Record<string, unknown>) {
    if (await kall(`/api/lager/${lager.id}/bevegelser`, "POST", { type: "inn", ...body })) {
      setValgt(null);
      setMengde("1");
      setFritekst(false);
      setFri({ name: "", item_no: "", unit: "stk", quantity: "1", cost_price: "" });
    }
  }

  async function tell(v: Lagervare, verdiTekst: string) {
    if (await kall(`/api/lager/${lager.id}/bevegelser`, "POST", { type: "telling", key: v.key, counted: verdiTekst })) {
      setTeller(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="tiny muted">
            <Link href="/register/lager">← Biler og lager</Link>
          </div>
          <h1>
            <span className="muted">#{lager.location_no}</span> {lager.name}
          </h1>
          <p className="page-subtitle">
            {lager.kind === "bil" ? "Bil" : "Lager"}
            {lager.reg_no ? ` · ${lager.reg_no}` : ""}
            {lager.user_id ? ` · ${navn.get(lager.user_id) ?? ""}` : ""}
            {lager.note ? ` · ${lager.note}` : ""}
            {!lager.active && " · ute av bruk"}
          </p>
        </div>
        {meg.erAdmin && (
          <span className="row">
            <button type="button" className="button secondary" onClick={() => setEndrer(true)}>
              Endre
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => {
                if (
                  lager.active &&
                  !window.confirm(`Ta ${lager.name} ut av bruk? Beholdningen og historikken står, men det kan ikke føres mer på den.`)
                ) {
                  return;
                }
                kall(`/api/lager/${lager.id}`, "PATCH", { active: !lager.active });
              }}
            >
              {lager.active ? "Ta ut av bruk" : "Ta i bruk igjen"}
            </button>
          </span>
        )}
      </div>

      <div className="banner info">
        Skriv <strong>{lager.location_no}</strong> som referanse på bestillingen hos grossisten. Da legger
        leverandørfakturaen varene her av seg selv, slik et ordrenummer legger dem på ordren.
      </div>
      {error && !fritekst && <div className="banner error">{error}</div>}

      <div className="stack">
        {lager.active && (
          <div className="card card-pad">
            <div className="row-between" style={{ marginBottom: 10 }}>
              <span className="label" style={{ marginBottom: 0 }}>
                Legg varer i {lager.kind === "bil" ? "bilen" : "lageret"}
              </span>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setError(null);
                  setFritekst(true);
                }}
              >
                Vare utenfor katalogen
              </button>
            </div>
            {harKatalog ? (
              <GrossistSok
                onVelg={(t) => {
                  setValgt(t);
                  setMengde("1");
                }}
              />
            ) : (
              <div className="banner info" style={{ marginBottom: 0 }}>
                Ingen grossistkatalog ennå — bruk «Vare utenfor katalogen».
              </div>
            )}
            {valgt && (
              <form
                className="valgt-vare"
                onSubmit={(e) => {
                  e.preventDefault();
                  leggInn({ supplier_item_id: valgt.id, quantity: mengde });
                }}
              >
                <div className="row-between">
                  <div>
                    <strong>{valgt.name}</strong>
                    <div className="tiny muted">
                      {valgt.item_no} · {valgt.supplier_name} · kost{" "}
                      {formatPris(valgt.net_price_per_unit ?? valgt.list_price_per_unit)}/{valgt.unit}
                    </div>
                  </div>
                  <button type="button" className="button ghost" onClick={() => setValgt(null)}>
                    ×
                  </button>
                </div>
                <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
                  <label className="field" style={{ marginBottom: 0, width: 140 }}>
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
                  <button className="button" type="submit" disabled={busy}>
                    {busy ? "Legger inn…" : "Legg inn"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="label" style={{ marginBottom: 0 }}>
              Beholdning
            </span>
            {minus > 0 && (
              <span className="tiny" style={{ color: "var(--warning)" }}>
                {minus} {minus === 1 ? "vare" : "varer"} i minus — tatt ut uten å være ført inn. Tell for å rette.
              </span>
            )}
          </div>
          {varer.length === 0 ? (
            <div className="empty">
              <div className="empty-title">Ingenting her ennå</div>
              <div>Varene kommer fra leverandørfakturaer merket {lager.location_no}, eller legges inn over.</div>
            </div>
          ) : (
            <div className="tabell-rull">
              <table className="table tabell-mobil">
                <thead>
                  <tr>
                    <th>Varenr</th>
                    <th>Vare</th>
                    <th className="num">Mengde</th>
                    <th className="num">Kost</th>
                    <th className="num">Verdi</th>
                    <th aria-label="Handling" />
                  </tr>
                </thead>
                <tbody>
                  {varer.map((v) => (
                    <tr key={v.key}>
                      <td className="ordre-nr meta">{v.item_no ?? "—"}</td>
                      <td className="hoved">{v.name}</td>
                      <td className="num nowrap belop" style={v.quantity < 0 ? { color: "var(--warning)" } : undefined}>
                        <strong>{v.quantity.toLocaleString("nb-NO")}</strong> {v.unit}
                      </td>
                      <td className="num meta muted nowrap">{v.cost_price === null ? "—" : formatPris(v.cost_price)}</td>
                      <td className="num meta nowrap">{v.verdi ? formatNok(v.verdi) : "—"}</td>
                      <td className="handling">
                        {lager.active &&
                          (teller?.key === v.key ? (
                            <form
                              className="row"
                              onSubmit={(e) => {
                                e.preventDefault();
                                tell(v, teller.verdi);
                              }}
                            >
                              <input
                                className="input"
                                inputMode="decimal"
                                aria-label={`Antall ${v.name} i bilen`}
                                value={teller.verdi}
                                onChange={(e) => setTeller({ key: v.key, verdi: e.target.value })}
                                style={{ width: 80 }}
                                autoFocus
                                onFocus={(e) => e.target.select()}
                              />
                              <button className="button" type="submit" disabled={busy}>
                                OK
                              </button>
                              <button type="button" className="button ghost" onClick={() => setTeller(null)}>
                                ×
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              className="button ghost"
                              title="Sett beholdningen til det som faktisk ligger der"
                              onClick={() => setTeller({ key: v.key, verdi: String(Math.max(0, v.quantity)).replace(".", ",") })}
                            >
                              Tell
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="sum-rad">
                    <td colSpan={4}>Verdi eks. mva</td>
                    <td className="num">{formatNok(verdi)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="label" style={{ marginBottom: 0 }}>
              Inn og ut
            </span>
            {fleireRoersler && <span className="tiny muted">De {historikk.length} siste</span>}
          </div>
          {historikk.length === 0 ? (
            <div className="empty">
              <div>Ingen bevegelser ennå.</div>
            </div>
          ) : (
            <div className="tabell-rull">
              <table className="table tabell-mobil">
                <thead>
                  <tr>
                    <th>Dato</th>
                    <th>Type</th>
                    <th>Vare</th>
                    <th className="num">Mengde</th>
                    <th>Kilde</th>
                    <th>Av</th>
                    <th aria-label="Handling" />
                  </tr>
                </thead>
                <tbody>
                  {historikk.map((r) => {
                    const q = Number(r.quantity);
                    const forHand = !r.invoice_line_id && !r.material_entry_id;
                    return (
                      <tr key={r.id}>
                        <td className="meta muted nowrap">{formatDag(r.created_at)}</td>
                        <td className="meta">
                          <span className={`chip${r.kind === "inn" ? " faktura" : ""}`}>{TYPE_TEKST[r.kind]}</span>
                        </td>
                        <td className="hoved">
                          {r.name}
                          {r.item_no && <span className="tiny muted"> · {r.item_no}</span>}
                        </td>
                        <td className="num nowrap">
                          {q > 0 ? "+" : "−"}
                          {Math.abs(q).toLocaleString("nb-NO")} {r.unit}
                        </td>
                        <td className="meta muted">{r.note ?? (forHand ? "Ført for hånd" : "")}</td>
                        <td className="meta muted">{r.created_by ? (navn.get(r.created_by) ?? "") : ""}</td>
                        <td className="handling">
                          {forHand && (meg.erAdmin || r.created_by === meg.id) && (
                            <button
                              type="button"
                              className="button ghost"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Angre «${r.name}» ${q > 0 ? "+" : "−"}${Math.abs(q).toLocaleString("nb-NO")} ${r.unit}?`)) {
                                  kall(`/api/lager/${lager.id}/bevegelser/${r.id}`, "DELETE");
                                }
                              }}
                            >
                              Angre
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal open={fritekst} onClose={() => !busy && setFritekst(false)} title="Vare utenfor katalogen">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            leggInn({
              name: fri.name,
              item_no: fri.item_no || undefined,
              unit: fri.unit,
              quantity: fri.quantity,
              cost_price: fri.cost_price || undefined,
            });
          }}
        >
          {error && <div className="banner error">{error}</div>}
          <div className="kontakt-panel ny-post-panel">
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Vare</span>
              <input
                className="input"
                value={fri.name}
                onChange={(e) => setFri({ ...fri, name: e.target.value })}
                placeholder="Strips 200 mm, pose à 100"
                autoFocus
                required
              />
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Varenr.</span>
              <span className="kort-felt">
                <input
                  className="input"
                  value={fri.item_no}
                  onChange={(e) => setFri({ ...fri, item_no: e.target.value })}
                  placeholder="Valgfritt"
                />
              </span>
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Mengde</span>
              <span className="kort-felt">
                <input
                  className="input"
                  inputMode="decimal"
                  value={fri.quantity}
                  onChange={(e) => setFri({ ...fri, quantity: e.target.value })}
                  required
                />
              </span>
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Enhet</span>
              <span className="kort-felt">
                <input className="input" value={fri.unit} onChange={(e) => setFri({ ...fri, unit: e.target.value })} />
              </span>
            </label>
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Kostpris</span>
              <span className="kort-felt">
                <input
                  className="input"
                  inputMode="decimal"
                  value={fri.cost_price}
                  onChange={(e) => setFri({ ...fri, cost_price: e.target.value })}
                  placeholder="Per enhet eks. mva"
                />
              </span>
            </label>
            <div className="kontakt-rad">
              <span />
              <span className="hint" style={{ marginTop: -4 }}>
                Kostprisen er det salgsprisen regnes fra når varen tas ut på en ordre.
              </span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setFritekst(false)} disabled={busy}>
              Avbryt
            </button>
            <button className="button" type="submit" disabled={busy || !fri.name.trim()}>
              {busy ? "Legger inn…" : "Legg inn"}
            </button>
          </div>
        </form>
      </Modal>

      {endrer && (
        <LagerSkjema
          lager={lager}
          medlemmer={medlemmer}
          onLukk={() => setEndrer(false)}
          onLagra={() => {
            setEndrer(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** «2026-09-12T…» → «12.09.26», norsk tid — likt på tjener og i nettleser. */
function formatDag(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}
