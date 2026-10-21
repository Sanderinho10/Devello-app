"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { summerTimar } from "@/lib/ordre/summering";
import { formatNok, type TimeEntry } from "@/lib/types";

interface Timetype {
  id: string;
  name: string;
  unit: string;
  unit_price: number;
}

/**
 * Timer på ordren — skjemaet montøren bruker ute på jobb.
 *
 * Alt er valgt på forhånd der det går: dato er i dag, montør er en selv,
 * timetype er den første i lista. Da er det ett tall og ett trykk for det
 * vanlige tilfellet.
 *
 * Egne føringer kan endres og slettes; en administrator kan røre alle.
 * Det er samme regel som API-et håndhever — knappene viser bare det som er
 * lov.
 */
export function TimerFane({
  orderId,
  laast,
  entries,
  medlemmer,
  timetypar,
  meg,
}: {
  orderId: string;
  /** Fakturert eller avbrutt: lista står, skjemaet er borte. */
  laast: boolean;
  entries: TimeEntry[];
  medlemmer: { id: string; navn: string }[];
  timetypar: Timetype[];
  meg: { id: string; erAdmin: boolean };
}) {
  const router = useRouter();
  const [redigerer, setRedigerer] = useState<TimeEntry | null>(null);
  const [dato, setDato] = useState(iDag());
  const [userId, setUserId] = useState(meg.id);
  const [typeId, setTypeId] = useState(timetypar[0]?.id ?? "");
  const [timar, setTimar] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navn = new Map(medlemmer.map((m) => [m.id, m.navn]));
  const sum = summerTimar(entries);

  function nullstill() {
    setRedigerer(null);
    setDato(iDag());
    setUserId(meg.id);
    setTypeId(timetypar[0]?.id ?? "");
    setTimar("");
    setNote("");
    setError(null);
  }

  function startRedigering(e: TimeEntry) {
    setRedigerer(e);
    setDato(e.work_date);
    setUserId(e.user_id);
    setTypeId(e.price_item_id ?? "");
    setTimar(String(e.hours).replace(".", ","));
    setNote(e.note ?? "");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        work_date: dato,
        price_item_id: typeId,
        hours: timar,
        note,
        ...(meg.erAdmin ? { user_id: userId } : {}),
      };
      const res = await fetch(
        redigerer ? `/api/orders/${orderId}/timer/${redigerer.id}` : `/api/orders/${orderId}/timer`,
        {
          method: redigerer ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      nullstill();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function slett(e: TimeEntry) {
    if (!window.confirm(`Slette ${formatTimar(Number(e.hours))} ${e.time_type_name} ${formatDato(e.work_date)}?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/timer/${e.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      if (redigerer?.id === e.id) nullstill();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const kanRoere = (e: TimeEntry) => meg.erAdmin || e.user_id === meg.id;
  const perDato = grupperPerDato(entries);

  return (
    <div className="stack fane-mobil">
      {!laast && timetypar.length === 0 && (
        <div className="banner warning" style={{ marginBottom: 0 }}>
          Legg inn timepriser i prisfilen først.{" "}
          <Link href="/selskap/innstillinger/prisfil" style={{ textDecoration: "underline" }}>
            Gå til prisfilen →
          </Link>
        </div>
      )}

      {/* Føringen som én linje over tabellen, som i Go. På telefon stables
          feltene med full trykkflate. */}
      {!laast && timetypar.length > 0 && (
        <form className={`card foring${redigerer ? " redigerer" : ""}`} onSubmit={lagre}>
          <div className="foring-topp">
            <span className="label" style={{ marginBottom: 0 }}>
              {redigerer ? "Endre timeføring" : "Før timer"}
            </span>
            {redigerer && (
              <button type="button" className="button ghost" onClick={nullstill}>
                Avbryt
              </button>
            )}
          </div>
          {error && <div className="banner error">{error}</div>}

          <div className="foring-felt">
            <label className="foring-dato">
              <span className="label">Dato</span>
              <input
                className="input"
                type="date"
                value={dato}
                onChange={(e) => setDato(e.target.value)}
                required
              />
            </label>
            <label className="foring-montor">
              <span className="label">Montør</span>
              {meg.erAdmin ? (
                <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  {medlemmer.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.navn}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input" value={navn.get(meg.id) ?? "Meg"} readOnly />
              )}
            </label>
            <label className="foring-type">
              <span className="label">Timetype</span>
              <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {timetypar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {formatNok(t.unit_price)}/{t.unit}
                  </option>
                ))}
              </select>
            </label>
            <div className="foring-timar">
              <label>
                <span className="label">Timer</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={timar}
                  onChange={(e) => setTimar(e.target.value)}
                  placeholder="1,5"
                  required
                />
              </label>
            </div>
            <label className="foring-note">
              <span className="label">Kommentar</span>
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Valgfritt — trekking i kjeller"
              />
            </label>
            <div className="foring-knapp">
              <button className="button" type="submit" disabled={busy || !timar}>
                {busy ? "Lagrer…" : redigerer ? "Lagre" : "Legg til"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen timer ført</div>
            <div>{laast ? "Ordren er avsluttet." : "Det første tallet over blir første linje her."}</div>
          </div>
        ) : (
          <div className="tabell-rull">
            <table className="table tabell-mobil">
              <thead>
                <tr>
                  <th>Montør</th>
                  <th>Timetype</th>
                  <th>Kommentar</th>
                  <th className="num">Timer</th>
                  <th className="num">Beløp</th>
                  <th aria-label="Handling" />
                </tr>
              </thead>
              {/* Én tbody per dag, med dagen som overskriftsrad og dagens sum,
                  som gruppene i reskontroen i Go. */}
              {perDato.map(([d, rader]) => {
                const dag = summerTimar(rader);
                return (
                  <tbody key={d}>
                    <tr className="gruppe-rad">
                      <td colSpan={3}>{formatDato(d)}</td>
                      <td className="num">{formatTimar(dag.timar)}</td>
                      <td className="num">{formatNok(dag.kr)}</td>
                      <td />
                    </tr>
                    {rader.map((e) => (
                      <tr
                        key={e.id}
                        className={`${redigerer?.id === e.id ? "redigerer" : ""}${e.invoice_draft_id ? " fakturert" : ""}`}
                      >
                        <td className="hoved">{navn.get(e.user_id) ?? "Ukjent"}</td>
                        <td className="meta">
                          {e.time_type_name}
                          {e.invoice_draft_id && <span className="chip fakturert-merke">fakturert</span>}
                        </td>
                        <td className="meta muted">{e.note}</td>
                        <td className="num belop">
                          <strong>{formatTimar(Number(e.hours))}</strong>
                        </td>
                        <td className="num muted meta">
                          {formatNok(Number(e.hours) * Number(e.unit_price))}
                        </td>
                        <td className="handling">
                          {!laast && !e.invoice_draft_id && kanRoere(e) && (
                            <>
                              <button type="button" className="button ghost" onClick={() => startRedigering(e)}>
                                Rediger
                              </button>
                              <button type="button" className="button ghost" onClick={() => slett(e)}>
                                Slett
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
              <tfoot>
                {sum.perType.length > 1 &&
                  sum.perType.map((t) => (
                    <tr key={t.name} className="sum-type">
                      <td colSpan={3} className="muted">
                        {t.name}
                      </td>
                      <td className="num">{formatTimar(t.timar)}</td>
                      <td className="num">{formatNok(t.kr)}</td>
                      <td />
                    </tr>
                  ))}
                <tr className="sum-rad">
                  <td colSpan={3}>Sum</td>
                  <td className="num">{formatTimar(sum.timar)}</td>
                  <td className="num">{formatNok(sum.kr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function iDag(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function grupperPerDato(entries: TimeEntry[]): [string, TimeEntry[]][] {
  const m = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const liste = m.get(e.work_date) ?? [];
    liste.push(e);
    m.set(e.work_date, liste);
  }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function formatTimar(t: number): string {
  return `${t.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} t`;
}

function formatDato(iso: string): string {
  return new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso + "T00:00:00"),
  );
}
