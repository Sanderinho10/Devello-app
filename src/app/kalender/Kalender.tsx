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

/** Ny plassering etter ei flytting: tid og kven. */
interface Flytting {
  start: Date;
  slutt: Date;
  deltakarar: { id: string; navn: string }[];
}

const TIME_PX = 48;
const KVARTER_PX = TIME_PX / 4;
const LAGRA_VISNING = "devello.kalender.visning";

/**
 * Kalenderen.
 *
 * To visningar av same veke:
 *   - Montører: éi rad per person, éi kolonne per dag. Sjefen ser kven som
 *     er ledig og legg inn oppdrag ved å trykkje i ruta, eller drar ein
 *     avtale til ein annan dag eller ein annan montør.
 *   - Uke: klassisk timeplan med klokkeslett. Dra for å flytte, dra i
 *     nedre kant for å endre lengda. Kvarter for kvarter.
 *
 * Flytting blir lagra med ein gong og kan angrast. Dra og slepp er for mus
 * og penn; på telefon opnar eit trykk avtalen som før, så sidene framleis
 * kan rullast med fingeren.
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
  const [angre, setAngre] = useState<{ tekst: string; original: KalenderHending } | null>(null);

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

  // «Angre» står ei lita stund, så forsvinn han.
  useEffect(() => {
    if (!angre) return;
    const t = setTimeout(() => setAngre(null), 12_000);
    return () => clearTimeout(t);
  }, [angre]);

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

  /**
   * Lagre ei flytting. Kalenderen viser den nye plassen med ein gong; feilar
   * lagringa, kjem den gamle tilbake når kalenderen blir henta på nytt.
   */
  async function flytt(h: KalenderHending, ny: Flytting, medAngre = true) {
    const nyHending: KalenderHending = {
      ...h,
      starts_at: ny.start.toISOString(),
      ends_at: ny.slutt.toISOString(),
      deltakarar: ny.deltakarar,
    };
    setData((d) => d && { ...d, hendingar: d.hendingar.map((x) => (x.id === h.id ? nyHending : x)) });
    setFeil(null);
    try {
      const res = await fetch(`/api/kalender/${h.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: h.kind,
          order_id: h.order?.id ?? null,
          title: h.egen_tittel,
          description: h.description,
          location: h.location,
          starts_at: nyHending.starts_at,
          ends_at: nyHending.ends_at,
          all_day: h.all_day,
          deltakarar: ny.deltakarar.map((d) => d.id),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? "Kunne ikke flytte avtalen");
      if (medAngre) {
        const kven = ny.deltakarar.map((d) => d.navn.split(" ")[0]).join(", ");
        const dag = new Intl.DateTimeFormat("nb-NO", { weekday: "short", day: "numeric", month: "short" }).format(ny.start);
        setAngre({
          tekst: `Flyttet «${h.order ? `#${h.order.order_no} ` : ""}${h.title}» til ${dag} ${tidTekst({ start: ny.start, slutt: ny.slutt, heileDagen: h.all_day })}${kven ? ` · ${kven}` : ""}.`,
          original: h,
        });
      } else {
        setAngre(null);
      }
    } catch (err) {
      setFeil(err instanceof Error ? err.message : String(err));
    } finally {
      void hent();
    }
  }

  function angreFlytting() {
    if (!angre) return;
    const no = data?.hendingar.find((h) => h.id === angre.original.id);
    if (!no) return setAngre(null);
    void flytt(
      no,
      {
        start: new Date(angre.original.starts_at),
        slutt: new Date(angre.original.ends_at),
        deltakarar: angre.original.deltakarar,
      },
      false,
    );
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
      {angre && (
        <div className="banner success kal-angre" role="status">
          <span>{angre.tekst}</span>
          <button type="button" className="button secondary" onClick={angreFlytting}>
            Angre
          </button>
        </div>
      )}

      <div className="kal-forklaring tiny muted">
        {HENDING_TYPAR.map((t) => (
          <span key={t}>
            <span className={`kal-prikk ${t}`} /> {HENDING_NAMN[t]}
          </span>
        ))}
        {kanRedigere && <span>· Trykk i en tom rute for å legge inn en avtale, dra en avtale for å flytte den.</span>}
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
            onFlytt={flytt}
            onFeil={setFeil}
          />
        ) : (
          <Ukevisning
            dagar={dagar}
            hendingar={hendingar}
            kanRedigere={kanRedigere}
            filter={filter}
            onVelg={(h) => setDialog({ hending: h })}
            onNy={nyAvtale}
            onFlytt={flytt}
          />
        ))}

      <HendingDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onLagra={() => {
          setDialog(null);
          setAngre(null);
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

/** Heile dagar mellom to datoar, rekna i kalenderdagar (tolererer sommartid). */
function dagarMellom(fra: Date, til: Date): number {
  return Math.round((startPaaDag(til).getTime() - startPaaDag(fra).getTime()) / 86_400_000);
}

const dagNamn = (d: Date) => new Intl.DateTimeFormat("nb-NO", { weekday: "short" }).format(d).replace(".", "");
const erIDag = (d: Date) => isoDato(d) === isoDato(new Date());

// ── Dra og slepp ────────────────────────────────────────────────────────────

/**
 * Når eit drag sluttar, kjem det eit klikk på elementet under peikaren. Det
 * skal verken opne avtalen eller lage ein ny, så klikk rett etter eit drag
 * blir ignorerte.
 */
let sisteDragSlutt = 0;
const rettEtterDrag = () => Date.now() - sisteDragSlutt < 350;

/**
 * Startar eit drag frå pointerdown. Under 5 px rørsle er eit klikk, ikkje
 * eit drag. Berre mus og penn: på touch skal fingeren rulle sida.
 */
function startDrag(
  e: React.PointerEvent,
  cb: {
    flytt: (ev: PointerEvent, dx: number, dy: number) => void;
    slepp: (ev: PointerEvent, dx: number, dy: number) => void;
    avbryt: () => void;
  },
) {
  if (e.pointerType === "touch" || e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let drar = false;

  const flytt = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (!drar && Math.hypot(dx, dy) < 5) return;
    if (!drar) document.body.classList.add("kal-drar");
    drar = true;
    ev.preventDefault();
    cb.flytt(ev, dx, dy);
  };
  const ferdig = (ev: PointerEvent, avbrote: boolean) => {
    window.removeEventListener("pointermove", flytt);
    window.removeEventListener("pointerup", opp);
    window.removeEventListener("pointercancel", avbryt);
    window.removeEventListener("keydown", esc);
    document.body.classList.remove("kal-drar");
    if (!drar) return;
    sisteDragSlutt = Date.now();
    if (avbrote) cb.avbryt();
    else cb.slepp(ev, ev.clientX - x0, ev.clientY - y0);
  };
  const opp = (ev: PointerEvent) => ferdig(ev, false);
  const avbryt = (ev: PointerEvent) => ferdig(ev, true);
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape") return;
    window.removeEventListener("pointermove", flytt);
    window.removeEventListener("pointerup", opp);
    window.removeEventListener("pointercancel", avbryt);
    window.removeEventListener("keydown", esc);
    document.body.classList.remove("kal-drar");
    if (drar) {
      sisteDragSlutt = Date.now();
      cb.avbryt();
    }
  };
  window.addEventListener("pointermove", flytt);
  window.addEventListener("pointerup", opp);
  window.addEventListener("pointercancel", avbryt);
  window.addEventListener("keydown", esc);
}

/** Elementet under peikaren med data-attributtet, eller null. */
function under(ev: PointerEvent, attributt: string): HTMLElement | null {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  return (el?.closest(`[${attributt}]`) as HTMLElement | null) ?? null;
}

// ── Montørvisninga ──────────────────────────────────────────────────────────

/** Kort tekst i ei rute: «10–15» eller «10:30–15». */
function kortKl(d: Date): string {
  return d.getMinutes() === 0 ? String(d.getHours()) : klokke(d);
}

function Brikke({
  h,
  dag,
  onVelg,
  onPointerDown,
  drar,
}: {
  h: Hending;
  dag: Date;
  onVelg: (h: KalenderHending) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  drar?: boolean;
}) {
  const bit = bitPaaDag(h, dag);
  const heile = h.all_day || (bit && klokke(bit.fraKl) === "00:00" && isoDato(bit.tilKl) !== isoDato(bit.fraKl));
  const tid = heile || !bit ? "Hele dagen" : `${kortKl(bit.fraKl)}–${klokke(bit.tilKl) === "00:00" ? "24" : kortKl(bit.tilKl)}`;
  return (
    <button
      type="button"
      className={`kal-brikke ${h.kind}${onPointerDown ? " flyttbar" : ""}${drar ? " drar" : ""}`}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!rettEtterDrag()) onVelg(h);
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

const FELLES = "felles";

function Montorvisning({
  dagar,
  hendingar,
  kolleger,
  kanRedigere,
  onVelg,
  onNy,
  onFlytt,
  onFeil,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kolleger: Kollega[];
  kanRedigere: boolean;
  onVelg: (h: KalenderHending) => void;
  onNy: (f: Forslag) => void;
  onFlytt: (h: KalenderHending, ny: Flytting) => void;
  onFeil: (f: string | null) => void;
}) {
  // Kva som blir dratt, og ruta det ville landa i.
  const [drag, setDrag] = useState<{ id: string; maal: string | null } | null>(null);

  // Avtalar utan deltakarar gjeld heile firmaet: éi felles rad øvst.
  const felles = hendingar.filter((h) => h.deltakarar.length === 0);
  const rader: { id: string | null; navn: string; hendingar: Hending[] }[] = [
    ...(felles.length || drag ? [{ id: null, navn: "Hele firmaet", hendingar: felles }] : []),
    ...kolleger.map((k) => ({
      id: k.id,
      navn: k.navn,
      hendingar: hendingar.filter((h) => h.deltakarar.some((d) => d.id === k.id)),
    })),
  ];
  const namn = new Map(kolleger.map((k) => [k.id, k.navn]));

  /** Frå rad og dag til rad og dag: same klokkeslett, ny dag, og ny person i staden for den gamle. */
  function slepp(h: Hending, fraRad: string | null, fraDag: Date, maal: HTMLElement | null) {
    if (!maal) return;
    const tilRad = maal.dataset.rad || null;
    const tilDag = new Date(`${maal.dataset.dag}T12:00:00`);
    const dagar = dagarMellom(fraDag, tilDag);
    if (dagar === 0 && tilRad === fraRad) return;

    let deltakarar = h.deltakarar;
    if (tilRad !== fraRad) {
      if (tilRad === null) {
        if (h.kind === "oppdrag") return onFeil("Et oppdrag må ha en montør. Dra det til en person.");
        deltakarar = [];
      } else {
        const utan = fraRad ? h.deltakarar.filter((d) => d.id !== fraRad) : h.deltakarar;
        deltakarar = utan.some((d) => d.id === tilRad) ? utan : [...utan, { id: tilRad, navn: namn.get(tilRad) ?? "" }];
      }
    }
    onFlytt(h, { start: leggTilDagar(h.start, dagar), slutt: leggTilDagar(h.slutt, dagar), deltakarar });
  }

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
                <tr key={r.id ?? FELLES}>
                  <th className="kal-person" scope="row">
                    <div>{r.navn}</div>
                    {r.id && <div className="tiny muted">{timar.toLocaleString("nb-NO")} t planlagt</div>}
                  </th>
                  {dagar.map((d) => {
                    const nokkel = `${r.id ?? FELLES}|${isoDato(d)}`;
                    const iDag = r.hendingar
                      .filter((h) => bitPaaDag(h, d))
                      .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.getTime() - b.start.getTime());
                    return (
                      <td
                        key={isoDato(d)}
                        data-kal-celle=""
                        data-rad={r.id ?? ""}
                        data-dag={isoDato(d)}
                        className={`kal-celle${kanRedigere ? " ledig" : ""}${erIDag(d) ? " i-dag" : ""}${d.getDay() % 6 === 0 ? " helg" : ""}${drag?.maal === nokkel ? " slepp-her" : ""}`}
                        onClick={() => {
                          if (rettEtterDrag()) return;
                          onNy({ start: settKl(d, 7), slutt: settKl(d, 15), deltakarar: r.id ? [r.id] : [], kind: r.id ? "oppdrag" : "mote" });
                        }}
                      >
                        {iDag.map((h) => (
                          <Brikke
                            key={h.id}
                            h={h}
                            dag={d}
                            onVelg={onVelg}
                            drar={drag?.id === h.id}
                            onPointerDown={
                              kanRedigere
                                ? (e) =>
                                    startDrag(e, {
                                      flytt: (ev) => {
                                        const m = under(ev, "data-kal-celle");
                                        setDrag({ id: h.id, maal: m ? `${m.dataset.rad || FELLES}|${m.dataset.dag}` : null });
                                      },
                                      slepp: (ev) => {
                                        setDrag(null);
                                        slepp(h, r.id, d, under(ev, "data-kal-celle"));
                                      },
                                      avbryt: () => setDrag(null),
                                    })
                                : undefined
                            }
                          />
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

// ── Vekevisninga ────────────────────────────────────────────────────────────

/** Kvar blokka blir viss ho blir sleppt no. */
interface Forhandsvisning {
  id: string;
  dag: Date;
  start: Date;
  slutt: Date;
}

function Ukevisning({
  dagar,
  hendingar,
  kanRedigere,
  filter,
  onVelg,
  onNy,
  onFlytt,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kanRedigere: boolean;
  filter: string;
  onVelg: (h: KalenderHending) => void;
  onNy: (f: Forslag) => void;
  onFlytt: (h: KalenderHending, ny: Flytting) => void;
}) {
  const [drag, setDrag] = useState<Forhandsvisning | null>(null);

  const erHeildag = (h: Hending, d: Date) => {
    if (h.all_day) return true;
    const bit = bitPaaDag(h, d);
    // Ein avtale som dekkjer heile dagen (midt i ein fleirdagars) står øvst.
    return Boolean(bit && bit.fraKl.getTime() === startPaaDag(d).getTime() && bit.tilKl.getTime() === leggTilDagar(startPaaDag(d), 1).getTime());
  };
  // Berre avtalar innanfor éin dag kan drast her; fleirdagars blir endra i skjemaet.
  const eiDag = (h: Hending) => !h.all_day && isoDato(h.start) === isoDato(new Date(h.slutt.getTime() - 1));

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

  /** Flytt heile blokka: ny dag frå kolonna under peikaren, ny tid i kvarter. */
  function dragFlytt(h: Hending, dag: Date, ev: PointerEvent, dy: number): Forhandsvisning {
    const kolonne = under(ev, "data-kal-dag");
    const tilDag = kolonne ? new Date(`${kolonne.dataset.kalDag}T12:00:00`) : dag;
    const kvarter = Math.round(dy / KVARTER_PX);
    const start = new Date(leggTilDagar(h.start, dagarMellom(dag, tilDag)).getTime() + kvarter * 15 * 60_000);
    return { id: h.id, dag: tilDag, start, slutt: new Date(start.getTime() + (h.slutt.getTime() - h.start.getTime())) };
  }

  /** Dra i nedre kant: ny slutt i kvarter, minst eitt kvarter langt. */
  function dragLengd(h: Hending, dag: Date, dy: number): Forhandsvisning {
    const kvarter = Math.round(dy / KVARTER_PX);
    const slutt = new Date(Math.max(h.slutt.getTime() + kvarter * 15 * 60_000, h.start.getTime() + 15 * 60_000));
    return { id: h.id, dag, start: h.start, slutt };
  }

  function slepp(h: Hending, ny: Forhandsvisning) {
    setDrag(null);
    if (ny.start.getTime() === h.start.getTime() && ny.slutt.getTime() === h.slutt.getTime()) return;
    onFlytt(h, { start: ny.start, slutt: ny.slutt, deltakarar: h.deltakarar });
  }

  const blokkStil = (fraKl: Date, tilKl: Date, dag: Date) => {
    const topp = ((fraKl.getTime() - settKl(dag, fraTime).getTime()) / 3_600_000) * TIME_PX;
    const lengd = Math.max(((tilKl.getTime() - fraKl.getTime()) / 3_600_000) * TIME_PX, 22);
    return { top: topp, height: lengd - 2 };
  };

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
              const forhand = drag && isoDato(drag.dag) === isoDato(d) ? drag : null;
              return (
                <div
                  key={isoDato(d)}
                  data-kal-dag={isoDato(d)}
                  className={`kal-uke-kolonne${kanRedigere ? " ledig" : ""}${erIDag(d) ? " i-dag" : ""}`}
                  style={{ backgroundSize: `100% ${TIME_PX}px` }}
                  onClick={(e) => {
                    if (rettEtterDrag()) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const halvtimar = Math.floor(y / (TIME_PX / 2));
                    const start = settKl(d, fraTime + Math.floor(halvtimar / 2), (halvtimar % 2) * 30);
                    onNy({ start, slutt: new Date(start.getTime() + 2 * 3_600_000), deltakarar: filter ? [filter] : [] });
                  }}
                >
                  {erIDag(d) && <NoLinje fraTime={fraTime} tilTime={tilTime} />}
                  {bitar.map((b) => {
                    const p = plass.get(b.id) ?? { kolonne: 0, kolonnar: 1 };
                    const flyttbar = kanRedigere && eiDag(b);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`kal-blokk ${b.kind}${flyttbar ? " flyttbar" : ""}${drag?.id === b.id ? " drar" : ""}`}
                        style={{
                          ...blokkStil(b.fraKl, b.tilKl, d),
                          left: `calc(${(p.kolonne / p.kolonnar) * 100}% + 2px)`,
                          width: `calc(${100 / p.kolonnar}% - 4px)`,
                        }}
                        onPointerDown={
                          flyttbar
                            ? (e) =>
                                startDrag(e, {
                                  flytt: (ev, _dx, dy) => setDrag(dragFlytt(b, d, ev, dy)),
                                  slepp: (ev, _dx, dy) => slepp(b, dragFlytt(b, d, ev, dy)),
                                  avbryt: () => setDrag(null),
                                })
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!rettEtterDrag()) onVelg(b);
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
                        {flyttbar && (
                          <span
                            className="kal-blokk-handtak"
                            aria-hidden="true"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              startDrag(e, {
                                flytt: (_ev, _dx, dy) => setDrag(dragLengd(b, d, dy)),
                                slepp: (_ev, _dx, dy) => slepp(b, dragLengd(b, d, dy)),
                                avbryt: () => setDrag(null),
                              });
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                  {forhand && (
                    <div className="kal-blokk forhand" style={{ ...blokkStil(forhand.start, forhand.slutt, d), left: 2, right: 2 }}>
                      <span className="kal-blokk-tid">
                        {klokke(forhand.start)}–{klokke(forhand.slutt)}
                      </span>
                    </div>
                  )}
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
