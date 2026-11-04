"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KalenderHending, Kollega } from "@/lib/kalender/hent";
import {
  HENDING_NAMN,
  HENDING_TYPAR,
  bitPaaDag,
  isoDato,
  klokke,
  leggTilDagar,
  mandag,
  plasserSideOmSide,
  startPaaDag,
  tidTekst,
  vekenummer,
} from "@/lib/kalender/tid";
import { HendingDialog, type Forslag } from "./HendingDialog";

type Visning = "montorer" | "uke";

interface Data {
  hendingar: KalenderHending[];
  kolleger: Kollega[];
  kan_redigere: boolean;
  meg: string;
}

/** Ein avtale med tidene som Date, så vi slepp å parse dei i kvar celle. */
type Hending = KalenderHending & { start: Date; slutt: Date };

const TIME_PX = 48;
const LAGRA_VISNING = "devello.kalender.visning";

/**
 * Kalenderen.
 *
 * To visningar av same veke:
 *   - Montører: éi rad per person, éi kolonne per dag. Sjefen ser kven som
 *     er ledig og legg inn oppdrag ved å trykkje i ruta.
 *   - Uke: klassisk timeplan med klokkeslett, for å sjå dagen i detalj.
 *
 * Administratorar legg inn og endrar; andre ser. Vekene blir henta éi om
 * gongen, så sida er rask sjølv med mange avtalar.
 */
export function Kalender({ startDato }: { startDato: string | null }) {
  const [ukeStart, setUkeStart] = useState(() => {
    const d = startDato ? new Date(`${startDato}T12:00:00`) : new Date();
    return mandag(Number.isNaN(d.getTime()) ? new Date() : d);
  });
  const [visning, setVisning] = useState<Visning>("montorer");
  const [filter, setFilter] = useState<string>("");
  const [data, setData] = useState<Data | null>(null);
  const [laster, setLaster] = useState(true);
  const [feil, setFeil] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ hending?: KalenderHending; forslag?: Forslag } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAGRA_VISNING);
      if (v === "uke" || v === "montorer") setVisning(v);
    } catch {
      // Uten lagring: montørvisningen.
    }
  }, []);

  function byttVisning(v: Visning) {
    setVisning(v);
    try {
      localStorage.setItem(LAGRA_VISNING, v);
    } catch {
      // Ikke viktig.
    }
  }

  const hent = useCallback(async () => {
    setLaster(true);
    try {
      const fra = ukeStart.toISOString();
      const til = leggTilDagar(ukeStart, 7).toISOString();
      const res = await fetch(`/api/kalender?fra=${encodeURIComponent(fra)}&til=${encodeURIComponent(til)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke hente kalenderen");
      setData(payload as Data);
      setFeil(null);
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      setLaster(false);
    }
  }, [ukeStart]);

  useEffect(() => {
    void hent();
  }, [hent]);

  // Adressa følgjer veka, så ein kan dele lenkja og få same veke.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("uke", isoDato(ukeStart));
    window.history.replaceState(null, "", url);
  }, [ukeStart]);

  const dagar = useMemo(() => Array.from({ length: 7 }, (_, i) => leggTilDagar(ukeStart, i)), [ukeStart]);
  const hendingar: Hending[] = useMemo(
    () =>
      (data?.hendingar ?? [])
        .map((h) => ({ ...h, start: new Date(h.starts_at), slutt: new Date(h.ends_at) }))
        .filter((h) => !filter || h.deltakarar.some((d) => d.id === filter) || h.deltakarar.length === 0),
    [data, filter],
  );
  const kanRedigere = Boolean(data?.kan_redigere);
  const kolleger = data?.kolleger ?? [];

  function nyAvtale(forslag: Forslag) {
    if (kanRedigere) setDialog({ forslag });
  }

  const sondag = leggTilDagar(ukeStart, 6);
  const periode =
    ukeStart.getMonth() === sondag.getMonth()
      ? `${ukeStart.getDate()}.–${new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(sondag)}`
      : `${new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(ukeStart)} – ${new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", year: "numeric" }).format(sondag)}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Kalender</h1>
          <p className="page-subtitle">Hvem er hvor, og når — oppdrag, møter og fravær.</p>
        </div>
      </div>

      <div className="verktoylinje kal-verktoy">
        <div className="row">
          <button type="button" className="button secondary" onClick={() => setUkeStart(mandag(new Date()))}>
            I dag
          </button>
          <button type="button" className="button ghost" aria-label="Forrige uke" onClick={() => setUkeStart(leggTilDagar(ukeStart, -7))}>
            ‹
          </button>
          <button type="button" className="button ghost" aria-label="Neste uke" onClick={() => setUkeStart(leggTilDagar(ukeStart, 7))}>
            ›
          </button>
          <strong className="kal-periode">
            Uke {vekenummer(ukeStart)} <span className="muted">· {periode}</span>
          </strong>
          {laster && <span className="muted tiny">Henter…</span>}
        </div>
        <div className="verktoylinje-hoyre">
          <select className="input kal-filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Vis for">
            <option value="">Alle ansatte</option>
            {data && <option value={data.meg}>Bare meg</option>}
            {kolleger
              .filter((k) => k.id !== data?.meg)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.navn}
                </option>
              ))}
          </select>
          <nav className="type-switch kompakt" aria-label="Visning">
            <button type="button" className={`type-option${visning === "montorer" ? " active" : ""}`} onClick={() => byttVisning("montorer")}>
              Montører
            </button>
            <button type="button" className={`type-option${visning === "uke" ? " active" : ""}`} onClick={() => byttVisning("uke")}>
              Uke
            </button>
          </nav>
          {kanRedigere && (
            <button
              type="button"
              className="button"
              onClick={() => {
                const dag = dagar.find((d) => isoDato(d) === isoDato(new Date())) ?? ukeStart;
                nyAvtale({ start: settKl(dag, 7), slutt: settKl(dag, 15) });
              }}
            >
              Ny avtale
            </button>
          )}
        </div>
      </div>

      {feil && <div className="banner error">{feil}</div>}

      <div className="kal-forklaring tiny muted">
        {HENDING_TYPAR.map((t) => (
          <span key={t}>
            <span className={`kal-prikk ${t}`} /> {HENDING_NAMN[t]}
          </span>
        ))}
        {kanRedigere && <span>· Trykk i en tom rute for å legge inn en avtale.</span>}
      </div>

      {data &&
        (visning === "montorer" ? (
          <Montorvisning
            dagar={dagar}
            hendingar={hendingar}
            kolleger={filter ? kolleger.filter((k) => k.id === filter) : kolleger}
            kanRedigere={kanRedigere}
            onVelg={(h) => setDialog({ hending: h })}
            onNy={nyAvtale}
          />
        ) : (
          <Ukevisning
            dagar={dagar}
            hendingar={hendingar}
            kanRedigere={kanRedigere}
            filter={filter}
            onVelg={(h) => setDialog({ hending: h })}
            onNy={nyAvtale}
          />
        ))}

      <HendingDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onLagra={() => {
          setDialog(null);
          void hent();
        }}
        kolleger={kolleger}
        hending={dialog?.hending}
        forslag={dialog?.forslag}
        kanRedigere={kanRedigere}
      />
    </>
  );
}

/** Same dag, klokka h:m. */
function settKl(dag: Date, h: number, m = 0): Date {
  const d = startPaaDag(dag);
  d.setHours(h, m, 0, 0);
  return d;
}

const dagNamn = (d: Date) => new Intl.DateTimeFormat("nb-NO", { weekday: "short" }).format(d).replace(".", "");
const erIDag = (d: Date) => isoDato(d) === isoDato(new Date());

/** Kort tekst i ei rute: «10–15» eller «10:30–15». */
function kortKl(d: Date): string {
  return d.getMinutes() === 0 ? String(d.getHours()) : klokke(d);
}

function Brikke({ h, dag, onVelg }: { h: Hending; dag: Date; onVelg: (h: KalenderHending) => void }) {
  const bit = bitPaaDag(h, dag);
  const heile = h.all_day || (bit && klokke(bit.fraKl) === "00:00" && isoDato(bit.tilKl) !== isoDato(bit.fraKl));
  const tid = heile || !bit ? "Hele dagen" : `${kortKl(bit.fraKl)}–${klokke(bit.tilKl) === "00:00" ? "24" : kortKl(bit.tilKl)}`;
  return (
    <button
      type="button"
      className={`kal-brikke ${h.kind}`}
      onClick={(e) => {
        e.stopPropagation();
        onVelg(h);
      }}
      title={[h.order ? `#${h.order.order_no} ${h.title}` : h.title, h.order?.customer_name, h.location ?? h.order?.site_address]
        .filter(Boolean)
        .join("\n")}
    >
      <span className="kal-brikke-tid">{tid}</span>
      <span className="kal-brikke-tittel">
        {h.order && <span className="kal-ordrenr">#{h.order.order_no} </span>}
        {h.title}
      </span>
      {h.order?.site_address && <span className="kal-brikke-stad">{h.order.site_address}</span>}
    </button>
  );
}

/** Timar i avtalar som ikkje er fravær, innanfor dagane — til kapasitetstalet per person. */
function planlagdeTimar(hendingar: Hending[], dagar: Date[]): number {
  let ms = 0;
  for (const h of hendingar) {
    if (h.kind === "fravaer" || h.all_day) continue;
    for (const d of dagar) {
      const bit = bitPaaDag(h, d);
      if (bit) ms += bit.tilKl.getTime() - bit.fraKl.getTime();
    }
  }
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function Montorvisning({
  dagar,
  hendingar,
  kolleger,
  kanRedigere,
  onVelg,
  onNy,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kolleger: Kollega[];
  kanRedigere: boolean;
  onVelg: (h: KalenderHending) => void;
  onNy: (f: Forslag) => void;
}) {
  // Avtalar utan deltakarar gjeld heile firmaet: éi felles rad øvst.
  const felles = hendingar.filter((h) => h.deltakarar.length === 0);
  const rader: { id: string | null; navn: string; hendingar: Hending[] }[] = [
    ...(felles.length ? [{ id: null, navn: "Hele firmaet", hendingar: felles }] : []),
    ...kolleger.map((k) => ({
      id: k.id,
      navn: k.navn,
      hendingar: hendingar.filter((h) => h.deltakarar.some((d) => d.id === k.id)),
    })),
  ];

  return (
    <div className="card">
      <div className="tabell-rull">
        <table className="kal-montorer">
          <thead>
            <tr>
              <th className="kal-person">Ansatt</th>
              {dagar.map((d) => (
                <th key={isoDato(d)} className={`${erIDag(d) ? "i-dag" : ""}${d.getDay() % 6 === 0 ? " helg" : ""}`}>
                  <span className="kal-dagnamn">{dagNamn(d)}</span> {d.getDate()}.{d.getMonth() + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => {
              const timar = planlagdeTimar(r.hendingar, dagar);
              return (
                <tr key={r.id ?? "felles"}>
                  <th className="kal-person" scope="row">
                    <div>{r.navn}</div>
                    {r.id && <div className="tiny muted">{timar.toLocaleString("nb-NO")} t planlagt</div>}
                  </th>
                  {dagar.map((d) => {
                    const iDag = r.hendingar
                      .filter((h) => bitPaaDag(h, d))
                      .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.getTime() - b.start.getTime());
                    return (
                      <td
                        key={isoDato(d)}
                        className={`kal-celle${kanRedigere ? " ledig" : ""}${erIDag(d) ? " i-dag" : ""}${d.getDay() % 6 === 0 ? " helg" : ""}`}
                        onClick={() =>
                          onNy({ start: settKl(d, 7), slutt: settKl(d, 15), deltakarar: r.id ? [r.id] : [], kind: r.id ? "oppdrag" : "mote" })
                        }
                      >
                        {iDag.map((h) => (
                          <Brikke key={h.id} h={h} dag={d} onVelg={onVelg} />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ukevisning({
  dagar,
  hendingar,
  kanRedigere,
  filter,
  onVelg,
  onNy,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kanRedigere: boolean;
  filter: string;
  onVelg: (h: KalenderHending) => void;
  onNy: (f: Forslag) => void;
}) {
  const erHeildag = (h: Hending, d: Date) => {
    if (h.all_day) return true;
    const bit = bitPaaDag(h, d);
    // Ein avtale som dekkjer heile dagen (midt i ein fleirdagars) står øvst.
    return Boolean(bit && bit.fraKl.getTime() === startPaaDag(d).getTime() && bit.tilKl.getTime() === leggTilDagar(startPaaDag(d), 1).getTime());
  };

  // Timane som blir viste: 06–20, utvida så alle avtalar i veka får plass.
  let fraTime = 6;
  let tilTime = 20;
  for (const d of dagar) {
    for (const h of hendingar) {
      const bit = bitPaaDag(h, d);
      if (!bit || erHeildag(h, d)) continue;
      fraTime = Math.min(fraTime, bit.fraKl.getHours());
      const slutt = bit.tilKl.getHours() + (bit.tilKl.getMinutes() > 0 ? 1 : 0);
      tilTime = Math.max(tilTime, isoDato(bit.tilKl) !== isoDato(d) ? 24 : slutt);
    }
  }
  const timar = Array.from({ length: tilTime - fraTime }, (_, i) => fraTime + i);
  const hogd = timar.length * TIME_PX;
  const harHeildag = dagar.some((d) => hendingar.some((h) => bitPaaDag(h, d) && erHeildag(h, d)));

  return (
    <div className="card">
      <div className="tabell-rull">
        <div className="kal-uke">
          <div className="kal-uke-hovud">
            <div />
            {dagar.map((d) => (
              <div key={isoDato(d)} className={`kal-uke-dag${erIDag(d) ? " i-dag" : ""}`}>
                <span className="kal-dagnamn">{dagNamn(d)}</span> <strong>{d.getDate()}</strong>
              </div>
            ))}
          </div>

          {harHeildag && (
            <div className="kal-uke-heildag">
              <div className="tiny muted">Hele dagen</div>
              {dagar.map((d) => (
                <div key={isoDato(d)}>
                  {hendingar
                    .filter((h) => bitPaaDag(h, d) && erHeildag(h, d))
                    .map((h) => (
                      <Brikke key={h.id} h={h} dag={d} onVelg={onVelg} />
                    ))}
                </div>
              ))}
            </div>
          )}

          <div className="kal-uke-kropp" style={{ height: hogd }}>
            <div className="kal-uke-klokke">
              {timar.map((t) => (
                <div key={t} style={{ height: TIME_PX }}>
                  {String(t).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {dagar.map((d) => {
              const bitar = hendingar
                .filter((h) => !erHeildag(h, d))
                .map((h) => bitPaaDag(h, d))
                .filter((b): b is NonNullable<typeof b> => b !== null);
              const plass = plasserSideOmSide(bitar);
              return (
                <div
                  key={isoDato(d)}
                  className={`kal-uke-kolonne${kanRedigere ? " ledig" : ""}${erIDag(d) ? " i-dag" : ""}`}
                  style={{ backgroundSize: `100% ${TIME_PX}px` }}
                  onClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const halvtimar = Math.floor(y / (TIME_PX / 2));
                    const start = settKl(d, fraTime + Math.floor(halvtimar / 2), (halvtimar % 2) * 30);
                    onNy({ start, slutt: new Date(start.getTime() + 2 * 3_600_000), deltakarar: filter ? [filter] : [] });
                  }}
                >
                  {erIDag(d) && <NoLinje fraTime={fraTime} tilTime={tilTime} />}
                  {bitar.map((b) => {
                    const p = plass.get(b.id) ?? { kolonne: 0, kolonnar: 1 };
                    const topp = ((b.fraKl.getTime() - settKl(d, fraTime).getTime()) / 3_600_000) * TIME_PX;
                    const lengd = Math.max(((b.tilKl.getTime() - b.fraKl.getTime()) / 3_600_000) * TIME_PX, 22);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`kal-blokk ${b.kind}`}
                        style={{
                          top: topp,
                          height: lengd - 2,
                          left: `calc(${(p.kolonne / p.kolonnar) * 100}% + 2px)`,
                          width: `calc(${100 / p.kolonnar}% - 4px)`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onVelg(b);
                        }}
                        title={`${b.title}\n${tidTekst({ start: b.start, slutt: b.slutt, heileDagen: b.all_day })}`}
                      >
                        <span className="kal-blokk-tid">
                          {klokke(b.fraKl)}–{klokke(b.tilKl) === "00:00" ? "24:00" : klokke(b.tilKl)}
                        </span>
                        <span className="kal-blokk-tittel">
                          {b.order && <span className="kal-ordrenr">#{b.order.order_no} </span>}
                          {b.title}
                        </span>
                        {b.deltakarar.length > 0 && (
                          <span className="kal-blokk-kven">{b.deltakarar.map((x) => x.navn.split(" ")[0]).join(", ")}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {hendingar.length === 0 && (
        <div className="empty">
          <div className="empty-title">Ingen avtaler denne uken</div>
          {kanRedigere && <div>Trykk i kalenderen for å legge inn et oppdrag eller et møte.</div>}
        </div>
      )}
    </div>
  );
}

/** Raud strek der klokka er no. Oppdaterer seg kvart minutt. */
function NoLinje({ fraTime, tilTime }: { fraTime: number; tilTime: number }) {
  const [no, setNo] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNo(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const timar = no.getHours() + no.getMinutes() / 60;
  if (timar < fraTime || timar > tilTime) return null;
  return <div className="kal-no" style={{ top: (timar - fraTime) * TIME_PX }} />;
}
