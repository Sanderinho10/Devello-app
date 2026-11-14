"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { OrdreSok } from "@/components/OrdreSok";
import { formatNok, type TimeEntry } from "@/lib/types";

export type TimeRad = TimeEntry & {
  orders: { id: string; order_no: number; title: string; status: string; customer_name: string } | null;
};

interface Timetype {
  id: string;
  name: string;
  unit: string;
  unit_price: number;
}

interface Aktivitet {
  id: string;
  name: string;
  active: boolean;
}

type Maal = "ordre" | "intern";

interface ValgtOrdre {
  id: string;
  order_no: number;
  title: string;
}

/**
 * Timeregisteret — alle timene, på tvers av ordrene.
 *
 * Skjemaet øverst er det samme som på ordren, med ett felt til: hva timene
 * føres på. En ordre, eller interntid. Interntid har ingen timetype og
 * ingen pris, så det feltet blir borte når den velges.
 *
 * «Rediger» henter føringen opp i skjemaet, og der kan den også flyttes:
 * velg en annen ordre, eller gjør den om til interntid. En administrator
 * kan i tillegg huke av flere rader og flytte dem samlet — det er slik en
 * uke ført på feil ordre ryddes opp.
 *
 * Fakturerte timer er låst og kan verken endres, flyttes eller slettes.
 */
export function Timeregister({
  rader,
  avkortet,
  iDag,
  filter,
  medlemmer,
  timetypar,
  aktivitetar,
  meg,
}: {
  rader: TimeRad[];
  /** Perioden hadde flere føringer enn siden viser. */
  avkortet: boolean;
  /** Dagens dato i norsk tid, fra tjeneren — så tjener og nettleser viser det samme. */
  iDag: string;
  filter: { fra: string; til: string; montor: string; vis: "alle" | "ordre" | "intern" };
  medlemmer: { id: string; navn: string }[];
  timetypar: Timetype[];
  aktivitetar: Aktivitet[];
  meg: { id: string; erAdmin: boolean };
}) {
  const router = useRouter();
  const aktive = aktivitetar.filter((a) => a.active);

  const [redigerer, setRedigerer] = useState<TimeRad | null>(null);
  const [dato, setDato] = useState(iDag);
  // Timetypen sendes bare ved redigering når noen faktisk har byttet den:
  // en føring på en utgått timetype skal ikke få ny pris av at en kommentar rettes.
  const [typeEndra, setTypeEndra] = useState(false);
  const [userId, setUserId] = useState(meg.id);
  const [maal, setMaal] = useState<Maal>("ordre");
  const [ordre, setOrdre] = useState<ValgtOrdre | null>(null);
  const [ordreTekst, setOrdreTekst] = useState("");
  const [aktivitetId, setAktivitetId] = useState(aktive[0]?.id ?? "");
  const [typeId, setTypeId] = useState(timetypar[0]?.id ?? "");
  const [timar, setTimar] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const [valgte, setValgte] = useState<Set<string>>(new Set());
  const [flytter, setFlytter] = useState(false);
  const [visAktivitetar, setVisAktivitetar] = useState(false);

  const navn = new Map(medlemmer.map((m) => [m.id, m.navn]));
  const perDato = grupperPerDato(rader);
  const kanRoere = (r: TimeRad) => !r.invoice_draft_id && (meg.erAdmin || r.user_id === meg.id);
  const flyttbare = rader.filter((r) => !r.invoice_draft_id);
  const valgteRader = rader.filter((r) => valgte.has(r.id));

  const sumOrdre = sum(rader.filter((r) => r.order_id));
  const sumIntern = sum(rader.filter((r) => !r.order_id));

  function nullstill() {
    setRedigerer(null);
    setDato(iDag);
    setUserId(meg.id);
    setTypeEndra(false);
    setTypeId(timetypar[0]?.id ?? "");
    setAktivitetId(aktive[0]?.id ?? "");
    setOrdre(null);
    setOrdreTekst("");
    setTimar("");
    setNote("");
    setError(null);
  }

  function startRedigering(r: TimeRad) {
    setRedigerer(r);
    setTypeEndra(false);
    setDato(r.work_date);
    setUserId(r.user_id);
    if (r.orders) {
      setMaal("ordre");
      setOrdre({ id: r.orders.id, order_no: r.orders.order_no, title: r.orders.title });
      setOrdreTekst(ordreEtikett(r.orders));
      if (r.price_item_id && timetypar.some((t) => t.id === r.price_item_id)) setTypeId(r.price_item_id);
    } else {
      setMaal("intern");
      setOrdre(null);
      setOrdreTekst("");
      if (r.internal_activity_id && aktive.some((a) => a.id === r.internal_activity_id)) {
        setAktivitetId(r.internal_activity_id);
      }
    }
    setTimar(String(r.hours).replace(".", ","));
    setNote(r.note ?? "");
    setError(null);
    setMelding(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function lagre(event: React.FormEvent) {
    event.preventDefault();
    if (maal === "ordre" && !ordre) {
      setError("Velg ordren timene skal føres på.");
      return;
    }
    setBusy(true);
    setError(null);
    setMelding(null);
    try {
      const felles = {
        work_date: dato,
        hours: timar,
        note,
        ...(meg.erAdmin ? { user_id: userId } : {}),
      };
      let url: string;
      let method: "POST" | "PATCH";
      let body: Record<string, unknown>;
      if (redigerer) {
        url = `/api/timer/${redigerer.id}`;
        method = "PATCH";
        body =
          maal === "intern"
            ? { ...felles, internal_activity_id: aktivitetId }
            : {
                ...felles,
                order_id: ordre!.id,
                // Timetypen sendes bare når den er byttet — eller når føringen
                // kommer fra interntid og ikke har noen.
                ...(typeId && (typeEndra || !redigerer.order_id) ? { price_item_id: typeId } : {}),
              };
      } else if (maal === "intern") {
        url = "/api/timer/intern";
        method = "POST";
        body = { ...felles, internal_activity_id: aktivitetId };
      } else {
        url = `/api/orders/${ordre!.id}/timer`;
        method = "POST";
        body = { ...felles, price_item_id: typeId };
      }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      // Ordren og datoen står igjen for neste føring: en uke føres dag for dag.
      if (redigerer) nullstill();
      else {
        setTimar("");
        setNote("");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function slett(r: TimeRad) {
    if (!window.confirm(`Slette ${formatTimar(Number(r.hours))} ${r.time_type_name} ${formatDato(r.work_date)}?`)) return;
    setError(null);
    setMelding(null);
    try {
      const res = await fetch(`/api/timer/${r.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke slette");
      if (redigerer?.id === r.id) nullstill();
      setValgte((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function veksle(id: string) {
    setValgte((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const kanFoere = maal === "intern" ? aktive.length > 0 : timetypar.length > 0;
  // Føringen står på en timetype som ikke lenger er i prislista. Den vises
  // som ført, og beholdes til noen velger en annen.
  const utgaattType =
    Boolean(redigerer?.order_id) && !typeEndra && !timetypar.some((t) => t.id === redigerer?.price_item_id);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Timeregister</h1>
          <p className="page-subtitle">
            {meg.erAdmin
              ? "Alle timene i selskapet, på ordre og internt. Før, rett og flytt timer her."
              : "Timene dine, på ordre og internt."}
          </p>
        </div>
        {meg.erAdmin && (
          <button type="button" className="button secondary" onClick={() => setVisAktivitetar(true)}>
            Interne aktiviteter
          </button>
        )}
      </div>

      <form className={`card foring${redigerer ? " redigerer" : ""}`} onSubmit={lagre}>
        <div className="foring-topp">
          <span className="label" style={{ marginBottom: 0 }}>
            {redigerer ? "Endre eller flytt timeføring" : "Før timer"}
          </span>
          {redigerer && (
            <button type="button" className="button ghost" onClick={nullstill}>
              Avbryt
            </button>
          )}
        </div>
        {error && <div className="banner error">{error}</div>}
        {maal === "ordre" && timetypar.length === 0 && (
          <div className="banner warning">
            Legg inn timepriser i prisfilen for å føre timer på ordre.{" "}
            <Link href="/selskap/innstillinger/prisfil" style={{ textDecoration: "underline" }}>
              Gå til prisfilen →
            </Link>
          </div>
        )}

        <div className="foring-felt">
          <label className="foring-dato">
            <span className="label">Dato</span>
            <input className="input" type="date" value={dato} onChange={(e) => setDato(e.target.value)} required />
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
          <label className="foring-maal">
            <span className="label">Føres på</span>
            <select className="input" value={maal} onChange={(e) => setMaal(e.target.value as Maal)}>
              <option value="ordre">Ordre</option>
              <option value="intern">Interntid</option>
            </select>
          </label>
          {maal === "ordre" ? (
            <>
              <div className="foring-ordre">
                <span className="label">Ordre</span>
                <OrdreSok
                  value={ordreTekst}
                  onChange={(t) => {
                    setOrdreTekst(t);
                    setOrdre(null);
                  }}
                  onVelg={(o) => {
                    setOrdre({ id: o.id, order_no: o.order_no, title: o.title });
                    setOrdreTekst(ordreEtikett(o));
                  }}
                  placeholder="Ordrenummer, tittel eller kunde"
                />
              </div>
              <label className="foring-type">
                <span className="label">Timetype</span>
                <select
                  className="input"
                  value={utgaattType ? "" : typeId}
                  onChange={(e) => {
                    setTypeId(e.target.value);
                    setTypeEndra(true);
                  }}
                >
                  {utgaattType && (
                    <option value="">
                      {redigerer!.time_type_name} — {formatNok(Number(redigerer!.unit_price))} (som ført)
                    </option>
                  )}
                  {timetypar.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {formatNok(t.unit_price)}/{t.unit}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="foring-ordre">
              <span className="label">Aktivitet</span>
              <select className="input" value={aktivitetId} onChange={(e) => setAktivitetId(e.target.value)}>
                {aktive.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Valgfritt" />
          </label>
          <div className="foring-knapp">
            <button className="button" type="submit" disabled={busy || !timar || !kanFoere}>
              {busy ? "Lagrer…" : redigerer ? "Lagre" : "Legg til"}
            </button>
          </div>
        </div>
      </form>

      {/* Filteret er en vanlig GET: perioden står i adressen og kan deles. */}
      <form className="verktoylinje timer-filter" method="get" action="/register/timer">
        <label>
          <span className="tiny muted">Fra</span>
          <input className="input" type="date" name="fra" defaultValue={filter.fra} key={`fra-${filter.fra}`} />
        </label>
        <label>
          <span className="tiny muted">Til</span>
          <input className="input" type="date" name="til" defaultValue={filter.til} key={`til-${filter.til}`} />
        </label>
        {meg.erAdmin && (
          <label>
            <span className="tiny muted">Montør</span>
            <select className="input" name="montor" defaultValue={filter.montor} key={`m-${filter.montor}`}>
              <option value="">Alle</option>
              {medlemmer.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.navn}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="tiny muted">Vis</span>
          <select className="input" name="vis" defaultValue={filter.vis} key={`v-${filter.vis}`}>
            <option value="alle">Alt</option>
            <option value="ordre">Bare ordre</option>
            <option value="intern">Bare interntid</option>
          </select>
        </label>
        <button className="button secondary" type="submit">
          Vis
        </button>
        <span className="verktoylinje-hoyre">
          <Link className="linkish" href={maanedLenke(iDag, filter, 0)}>
            Denne måneden
          </Link>
          <Link className="linkish" href={maanedLenke(iDag, filter, -1)}>
            Forrige måned
          </Link>
        </span>
      </form>

      {melding && <div className="banner info">{melding}</div>}
      {avkortet && (
        <div className="banner warning">
          Perioden har flere føringer enn siden viser. Velg en kortere periode eller én montør for å se alle.
        </div>
      )}

      {meg.erAdmin && valgte.size > 0 && (
        <div className="card timer-valgte">
          <span>
            <strong>{valgte.size}</strong> {valgte.size === 1 ? "føring" : "føringer"} valgt ·{" "}
            {formatTimar(sum(valgteRader).timar)}
          </span>
          <span className="row">
            <button type="button" className="button" onClick={() => setFlytter(true)}>
              Flytt til …
            </button>
            <button type="button" className="button ghost" onClick={() => setValgte(new Set())}>
              Fjern valg
            </button>
          </span>
        </div>
      )}

      <div className="card">
        {rader.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen timer i perioden</div>
            <div>
              {formatDato(filter.fra)} – {formatDato(filter.til)}. Før timer i skjemaet over, eller velg en annen periode.
            </div>
          </div>
        ) : (
          <div className="tabell-rull">
            <table className="table tabell-mobil">
              <thead>
                <tr>
                  {meg.erAdmin && (
                    <th style={{ width: 32 }}>
                      <input
                        type="checkbox"
                        aria-label="Velg alle"
                        checked={flyttbare.length > 0 && flyttbare.every((r) => valgte.has(r.id))}
                        onChange={(e) => setValgte(e.target.checked ? new Set(flyttbare.map((r) => r.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Montør</th>
                  <th>Ført på</th>
                  <th>Timetype</th>
                  <th>Kommentar</th>
                  <th className="num">Timer</th>
                  <th className="num">Beløp</th>
                  <th aria-label="Handling" />
                </tr>
              </thead>
              {perDato.map(([d, dagens]) => {
                const dag = sum(dagens);
                return (
                  <tbody key={d}>
                    <tr className="gruppe-rad">
                      <td colSpan={meg.erAdmin ? 5 : 4}>{formatDato(d)}</td>
                      <td className="num">{formatTimar(dag.timar)}</td>
                      <td className="num">{formatNok(dag.kr)}</td>
                      <td />
                    </tr>
                    {dagens.map((r) => (
                      <tr
                        key={r.id}
                        className={`${redigerer?.id === r.id ? "redigerer" : ""}${r.invoice_draft_id ? " fakturert" : ""}`}
                      >
                        {meg.erAdmin && (
                          <td>
                            {!r.invoice_draft_id && (
                              <input
                                type="checkbox"
                                aria-label="Velg føringen"
                                checked={valgte.has(r.id)}
                                onChange={() => veksle(r.id)}
                              />
                            )}
                          </td>
                        )}
                        <td className="hoved">{navn.get(r.user_id) ?? "Ukjent"}</td>
                        <td className="meta">
                          {r.orders ? (
                            <Link className="lenke-bla" href={`/ordre/${r.orders.id}/timer`}>
                              #{r.orders.order_no} {r.orders.title}
                            </Link>
                          ) : (
                            <>
                              <span className="chip intern">Intern</span> {r.time_type_name}
                            </>
                          )}
                          {r.invoice_draft_id && <span className="chip fakturert-merke">fakturert</span>}
                        </td>
                        <td className="meta muted">{r.orders ? r.time_type_name : "—"}</td>
                        <td className="meta muted">{r.note}</td>
                        <td className="num belop">
                          <strong>{formatTimar(Number(r.hours))}</strong>
                        </td>
                        <td className="num muted meta">
                          {r.orders ? formatNok(Number(r.hours) * Number(r.unit_price)) : "—"}
                        </td>
                        <td className="handling">
                          {kanRoere(r) && (
                            <>
                              <button type="button" className="button ghost" onClick={() => startRedigering(r)}>
                                Rediger
                              </button>
                              <button type="button" className="button ghost" onClick={() => slett(r)}>
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
                <tr className="sum-type">
                  <td colSpan={meg.erAdmin ? 5 : 4} className="muted">
                    På ordre
                  </td>
                  <td className="num">{formatTimar(sumOrdre.timar)}</td>
                  <td className="num">{formatNok(sumOrdre.kr)}</td>
                  <td />
                </tr>
                <tr className="sum-type">
                  <td colSpan={meg.erAdmin ? 5 : 4} className="muted">
                    Interntid
                  </td>
                  <td className="num">{formatTimar(sumIntern.timar)}</td>
                  <td className="num">—</td>
                  <td />
                </tr>
                <tr className="sum-rad">
                  <td colSpan={meg.erAdmin ? 5 : 4}>Sum</td>
                  <td className="num">{formatTimar(round2(sumOrdre.timar + sumIntern.timar))}</td>
                  <td className="num">{formatNok(sumOrdre.kr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {flytter && (
        <FlyttDialog
          rader={valgteRader}
          timetypar={timetypar}
          aktivitetar={aktive}
          onLukk={() => setFlytter(false)}
          onFerdig={(tekst) => {
            setFlytter(false);
            setValgte(new Set());
            setMelding(tekst);
            router.refresh();
          }}
        />
      )}
      {visAktivitetar && (
        <AktivitetDialog
          aktivitetar={aktivitetar}
          onLukk={() => setVisAktivitetar(false)}
          onEndra={() => router.refresh()}
        />
      )}
    </>
  );
}

/** Flytter de valgte føringene samlet — til en annen ordre, eller til interntid. */
function FlyttDialog({
  rader,
  timetypar,
  aktivitetar,
  onLukk,
  onFerdig,
}: {
  rader: TimeRad[];
  timetypar: Timetype[];
  aktivitetar: Aktivitet[];
  onLukk: () => void;
  onFerdig: (melding: string) => void;
}) {
  const [maal, setMaal] = useState<Maal>("ordre");
  const [ordre, setOrdre] = useState<ValgtOrdre | null>(null);
  const [ordreTekst, setOrdreTekst] = useState("");
  const [aktivitetId, setAktivitetId] = useState(aktivitetar[0]?.id ?? "");
  const [typeId, setTypeId] = useState(timetypar[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Interntid har ingen timetype. Skal den inn på en ordre, må en velges.
  const fraIntern = rader.filter((r) => !r.order_id).length;
  const trengTimetype = maal === "ordre" && fraIntern > 0;
  const timarValgt = sum(rader).timar;

  async function flytt(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/timer/flytt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: rader.map((r) => r.id),
          ...(maal === "intern"
            ? { internal_activity_id: aktivitetId }
            : { order_id: ordre?.id, ...(trengTimetype ? { price_item_id: typeId } : {}) }),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke flytte");
      const deler = [`${payload.flytta} ${payload.flytta === 1 ? "føring" : "føringer"} flyttet`];
      if (payload.fakturert) deler.push(`${payload.fakturert} er fakturert og står igjen`);
      if (payload.allerede_der) deler.push(`${payload.allerede_der} sto der fra før`);
      onFerdig(deler.join(" · ") + ".");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onLukk()} title="Flytt timer">
      <form onSubmit={flytt}>
        {error && <div className="banner error">{error}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          {rader.length} {rader.length === 1 ? "føring" : "føringer"}, {formatTimar(timarValgt)} til sammen. Dato, montør,
          timer og kommentar følger med som de er.
        </p>
        <div className="kontakt-panel ny-post-panel">
          <label className="kontakt-rad">
            <span className="kontakt-rad-etikett">Flytt til</span>
            <select className="input" value={maal} onChange={(e) => setMaal(e.target.value as Maal)}>
              <option value="ordre">En annen ordre</option>
              <option value="intern">Interntid</option>
            </select>
          </label>
          {maal === "ordre" ? (
            <div className="kontakt-rad">
              <span className="kontakt-rad-etikett">Ordre</span>
              <OrdreSok
                value={ordreTekst}
                onChange={(t) => {
                  setOrdreTekst(t);
                  setOrdre(null);
                }}
                onVelg={(o) => {
                  setOrdre({ id: o.id, order_no: o.order_no, title: o.title });
                  setOrdreTekst(ordreEtikett(o));
                }}
                placeholder="Ordrenummer, tittel eller kunde"
                autoFocus
              />
            </div>
          ) : (
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Aktivitet</span>
              <select className="input" value={aktivitetId} onChange={(e) => setAktivitetId(e.target.value)}>
                {aktivitetar.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {trengTimetype && (
            <label className="kontakt-rad">
              <span className="kontakt-rad-etikett">Timetype</span>
              <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {timetypar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {formatNok(t.unit_price)}/{t.unit}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="kontakt-rad">
            <span />
            <span className="hint" style={{ marginTop: -4 }}>
              {maal === "intern"
                ? "Som interntid har timene ingen pris og kommer ikke på noen faktura."
                : trengTimetype
                  ? `${fraIntern} av føringene er interntid og får timetypen over. De andre beholder sin timetype og pris.`
                  : "Timetype og pris følger med som de er ført."}
            </span>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onLukk} disabled={busy}>
            Avbryt
          </button>
          <button
            className="button"
            type="submit"
            disabled={busy || (maal === "ordre" ? !ordre || (trengTimetype && !typeId) : !aktivitetId)}
          >
            {busy ? "Flytter…" : "Flytt"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Lista over det man kan føre interntid på. Bare administrator kommer hit. */
function AktivitetDialog({
  aktivitetar,
  onLukk,
  onEndra,
}: {
  aktivitetar: Aktivitet[];
  onLukk: () => void;
  onEndra: () => void;
}) {
  const [ny, setNy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function kall(url: string, method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke lagre");
      onEndra();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onLukk} title="Interne aktiviteter">
      {error && <div className="banner error">{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>
        Det montørene kan føre interntid på. En aktivitet som er tatt ut av bruk kan ikke velges, men timene som alt er
        ført på den står.
      </p>
      <div className="aktivitet-liste">
        {aktivitetar.map((a) => (
          <div key={a.id} className={`aktivitet-rad${a.active ? "" : " inaktiv"}`}>
            <input
              className="input"
              defaultValue={a.name}
              key={a.name}
              aria-label="Navn på aktiviteten"
              disabled={busy}
              onBlur={(e) => {
                const verdi = e.target.value.trim();
                if (verdi && verdi !== a.name) kall(`/api/interntid/${a.id}`, "PATCH", { name: verdi });
                else e.target.value = a.name;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => kall(`/api/interntid/${a.id}`, "PATCH", { active: !a.active })}
            >
              {a.active ? "Ta ut av bruk" : "Ta i bruk"}
            </button>
          </div>
        ))}
      </div>
      <form
        className="aktivitet-rad"
        style={{ marginTop: 12 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await kall("/api/interntid", "POST", { name: ny })) setNy("");
        }}
      >
        <input
          className="input"
          value={ny}
          onChange={(e) => setNy(e.target.value)}
          placeholder="Ny aktivitet, for eksempel HMS-arbeid"
        />
        <button className="button" type="submit" disabled={busy || !ny.trim()}>
          Legg til
        </button>
      </form>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onLukk}>
          Ferdig
        </button>
      </div>
    </Modal>
  );
}

function ordreEtikett(o: { order_no: number; title: string }): string {
  return `#${o.order_no} ${o.title}`;
}

function sum(rader: Pick<TimeRad, "hours" | "unit_price">[]): { timar: number; kr: number } {
  let timar = 0;
  let kr = 0;
  for (const r of rader) {
    timar += Number(r.hours);
    kr += Number(r.hours) * Number(r.unit_price);
  }
  return { timar: round2(timar), kr: round2(kr) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lenke til en hel måned: 0 = denne, -1 = forrige. Montør og visning følger med. */
function maanedLenke(iDag: string, filter: { montor: string; vis: string }, forskyving: number): string {
  const [aar, mnd] = iDag.split("-").map(Number);
  const start = new Date(Date.UTC(aar, mnd - 1 + forskyving, 1));
  const slutt = new Date(Date.UTC(aar, mnd + forskyving, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const params = new URLSearchParams({ fra: iso(start), til: iso(slutt) });
  if (filter.montor) params.set("montor", filter.montor);
  if (filter.vis !== "alle") params.set("vis", filter.vis);
  return `/register/timer?${params.toString()}`;
}

function grupperPerDato(rader: TimeRad[]): [string, TimeRad[]][] {
  const m = new Map<string, TimeRad[]>();
  for (const r of rader) {
    const liste = m.get(r.work_date) ?? [];
    liste.push(r);
    m.set(r.work_date, liste);
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
