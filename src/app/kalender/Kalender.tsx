"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KalenderHending, Kollega } from "@/lib/kalender/hent";
import {
  ARBEID_FRA,
  ARBEID_TIL,
  HENDING_NAMN,
  HENDING_TYPAR,
  bitPaaDag,
  innanfor,
  isoDato,
  klokke,
  klokketimar,
  leggTilDagar,
  mandag,
  plasserSideOmSide,
  startPaaDag,
  tidTekst,
  utanforArbeidstid,
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
/** Høgda på éi linje med avtalar i montørvisninga. */
const LINJE_PX = 38;
/** Lågaste rad: plass til namnet og timetalet til venstre. */
const RAD_MIN_PX = 58;
const LAGRA_VISNING = "devello.kalender.visning";
const LAGRA_DOGN = "devello.kalender.heiledognet";

/**
 * Kalenderen.
 *
 * To visningar av same veke:
 *   - Montører: éi rad per person, og kvar dag delt i ruter på éin time.
 *     Sjefen ser kva timar kvar montør er ledig, legg inn oppdrag ved å
 *     trykkje i ei rute, eller drar ein avtale til ei anna tid, ein annan
 *     dag eller ein annan montør.
 *   - Uke: klassisk timeplan med klokkeslett. Dra for å flytte, dra i
 *     nedre kant for å endre lengda. Kvarter for kvarter.
 *
 * Begge viser arbeidstida (07–15), markert med farge. «Hele døgnet» tek
 * fram timane utanfor.
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
  const [heileDognet, setHeileDognet] = useState(false);
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
      if (localStorage.getItem(LAGRA_DOGN) === "1") setHeileDognet(true);
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

  function byttDogn() {
    const ny = !heileDognet;
    setHeileDognet(ny);
    try {
      localStorage.setItem(LAGRA_DOGN, ny ? "1" : "0");
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
  // Timane som blir viste, og kor mange avtalar som ligg (delvis) utanfor dei.
  const fraTime = heileDognet ? 0 : ARBEID_FRA;
  const tilTime = heileDognet ? 24 : ARBEID_TIL;
  const utanfor = useMemo(() => hendingar.filter(utanforArbeidstid).length, [hendingar]);
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
          <button
            type="button"
            className={`button secondary kal-dogn${heileDognet ? " aktiv" : ""}`}
            aria-pressed={heileDognet}
            onClick={byttDogn}
            title={heileDognet ? "Vis bare arbeidstiden, 07–15" : "Vis også timene utenfor arbeidstiden"}
          >
            Hele døgnet
            {!heileDognet && utanfor > 0 && <span className="kal-dogn-tal">{utanfor} utenfor</span>}
          </button>
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
                nyAvtale({ start: settKl(dag, ARBEID_FRA), slutt: settKl(dag, ARBEID_TIL) });
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
        <span>
          <span className="kal-arbeid-prov" /> Arbeidstid {String(ARBEID_FRA).padStart(2, "0")}–{ARBEID_TIL}
        </span>
        {kanRedigere && <span>· Trykk i en tom rute for å legge inn en avtale, dra en avtale for å flytte den.</span>}
      </div>

      {data &&
        (visning === "montorer" ? (
          <Montorvisning
            dagar={dagar}
            hendingar={hendingar}
            kolleger={filter ? kolleger.filter((k) => k.id === filter) : kolleger}
            kanRedigere={kanRedigere}
            fraTime={fraTime}
            tilTime={tilTime}
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
            fraTime={fraTime}
            tilTime={tilTime}
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
const erHelg = (d: Date) => d.getDay() % 6 === 0;
/** Er timen i arbeidstida? Helga har inga. */
const erArbeidstime = (d: Date, t: number) => !erHelg(d) && t >= ARBEID_FRA && t < ARBEID_TIL;

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

/** Dekkjer biten heile dagen, anten fordi avtalen er heildags eller går over midnatt begge vegar? */
function dekkjerDagen(h: Hending, dag: Date): boolean {
  if (h.all_day) return true;
  const bit = bitPaaDag(h, dag);
  return Boolean(bit && klokke(bit.fraKl) === "00:00" && isoDato(bit.tilKl) !== isoDato(bit.fraKl));
}

/** «7–15», «10:30–15» eller «Hele dagen» for biten av avtalen på dagen. */
function brikkeTid(h: Hending, dag: Date): string {
  const bit = bitPaaDag(h, dag);
  if (!bit || dekkjerDagen(h, dag)) return "Hele dagen";
  return `${kortKl(bit.fraKl)}–${klokke(bit.tilKl) === "00:00" ? "24" : kortKl(bit.tilKl)}`;
}

const brikkeTittel = (h: Hending) =>
  [h.order ? `#${h.order.order_no} ${h.title}` : h.title, h.order?.customer_name, h.location ?? h.order?.site_address]
    .filter(Boolean)
    .join("\n");

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
  const tid = brikkeTid(h, dag);
  return (
    <button
      type="button"
      className={`kal-brikke ${h.kind}${onPointerDown ? " flyttbar" : ""}${drar ? " drar" : ""}`}
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        if (!rettEtterDrag()) onVelg(h);
      }}
      title={brikkeTittel(h)}
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

/** Ein avtale slik han står i ei dagsrute: frå og til i timar, klipt til timane som er viste. */
interface Stolpe {
  h: Hending;
  fra: number;
  til: number;
  linje: number;
}

/** Kvar avtalen blir viss han blir sleppt no (montørvisninga). */
interface MontorDrag {
  id: string;
  maal: string | null;
  start: Date;
  slutt: Date;
  heileDagen: boolean;
}

function Montorvisning({
  dagar,
  hendingar,
  kolleger,
  kanRedigere,
  fraTime,
  tilTime,
  onVelg,
  onNy,
  onFlytt,
  onFeil,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kolleger: Kollega[];
  kanRedigere: boolean;
  fraTime: number;
  tilTime: number;
  onVelg: (h: KalenderHending) => void;
  onNy: (f: Forslag) => void;
  onFlytt: (h: KalenderHending, ny: Flytting) => void;
  onFeil: (f: string | null) => void;
}) {
  // Kva som blir dratt, og kvar det ville landa.
  const [drag, setDrag] = useState<MontorDrag | null>(null);

  const timar = Array.from({ length: tilTime - fraTime }, (_, i) => fraTime + i);
  const tal = timar.length;
  const trong = tal > 12;
  const pst = (t: number) => `${((t - fraTime) / tal) * 100}%`;

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

  /** Avtalane i éi dagsrute. Dei som overlappar får kvar si linje under kvarandre. */
  function stolpar(hs: Hending[], d: Date): { stolpar: Stolpe[]; linjer: number } {
    const synlege = hs.flatMap((h) => {
      const bit = bitPaaDag(h, d);
      if (!bit) return [];
      const t = dekkjerDagen(h, d) ? { fra: fraTime, til: tilTime } : innanfor(klokketimar(bit, d), fraTime, tilTime);
      return t ? [{ bit, ...t }] : [];
    });
    const plass = plasserSideOmSide(synlege.map((s) => s.bit));
    let linjer = 1;
    const ut = synlege.map((s) => {
      const p = plass.get(s.bit.id) ?? { kolonne: 0, kolonnar: 1 };
      linjer = Math.max(linjer, p.kolonnar);
      return { h: s.bit as Hending, fra: s.fra, til: s.til, linje: p.kolonne };
    });
    return { stolpar: ut, linjer };
  }

  /** Klokkeslettet (i timar) under peikaren i ei dagsrute. */
  function timeVed(spor: HTMLElement, x: number): number {
    const r = spor.getBoundingClientRect();
    return fraTime + Math.min(Math.max((x - r.left) / r.width, 0), 1) * tal;
  }

  /**
   * Ny plass for avtalen: dagen og personen frå ruta under peikaren, og
   * klokkeslettet flytta like langt som peikaren — i halve timar, så ei
   * flytting rett opp eller ned ikkje endrar tida.
   */
  function nyPlass(h: Hending, fraDag: Date, t0: number, ev: PointerEvent): MontorDrag {
    const maal = under(ev, "data-kal-celle");
    if (!maal) return { id: h.id, maal: null, start: h.start, slutt: h.slutt, heileDagen: h.all_day };
    const dagarFram = dagarMellom(fraDag, new Date(`${maal.dataset.dag}T12:00:00`));
    const ms = h.all_day ? 0 : Math.round((timeVed(maal, ev.clientX) - t0) * 2) * 30 * 60_000;
    return {
      id: h.id,
      maal: `${maal.dataset.rad || FELLES}|${maal.dataset.dag}`,
      start: new Date(leggTilDagar(h.start, dagarFram).getTime() + ms),
      slutt: new Date(leggTilDagar(h.slutt, dagarFram).getTime() + ms),
      heileDagen: h.all_day,
    };
  }

  /** Slepp: ny tid og dag, og ny person i staden for den gamle når rada er ei anna. */
  function slepp(h: Hending, fraRad: string | null, ny: MontorDrag) {
    if (!ny.maal) return;
    const rad = ny.maal.split("|")[0];
    const tilRad = rad === FELLES ? null : rad;
    if (tilRad === fraRad && ny.start.getTime() === h.start.getTime()) return;

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
    onFlytt(h, { start: ny.start, slutt: ny.slutt, deltakarar });
  }

  return (
    <div className="card">
      <div className="tabell-rull">
        <table className="kal-montorer kal-tidslinje" style={{ minWidth: 150 + 7 * tal * (trong ? 14 : 16) }}>
          <thead>
            <tr>
              <th className="kal-person" rowSpan={2}>
                Ansatt
              </th>
              {dagar.map((d) => (
                <th key={isoDato(d)} className={`kal-dag${erIDag(d) ? " i-dag" : ""}${erHelg(d) ? " helg" : ""}`}>
                  <span className="kal-dagnamn">{dagNamn(d)}</span> {d.getDate()}.{d.getMonth() + 1}
                </th>
              ))}
            </tr>
            <tr>
              {dagar.map((d) => (
                <th key={isoDato(d)} className={`kal-timehovud${erHelg(d) ? " helg" : ""}`}>
                  <div className="kal-spor">
                    {timar.map((t) => (
                      <span key={t} className={`kal-timetal${erArbeidstime(d, t) ? " arbeid" : ""}`}>
                        {!trong || t % 2 === 0 ? t : ""}
                      </span>
                    ))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rader.map((r) => {
              const timarPlanlagt = planlagdeTimar(r.hendingar, dagar);
              const celler = dagar.map((d) => ({ d, ...stolpar(r.hendingar, d) }));
              const hogd = Math.max(Math.max(...celler.map((c) => c.linjer)) * LINJE_PX + 6, RAD_MIN_PX);
              return (
                <tr key={r.id ?? FELLES}>
                  <th className="kal-person" scope="row">
                    <div>{r.navn}</div>
                    {r.id && <div className="tiny muted">{timarPlanlagt.toLocaleString("nb-NO")} t planlagt</div>}
                  </th>
                  {celler.map(({ d, stolpar: iDag }) => {
                    const nokkel = `${r.id ?? FELLES}|${isoDato(d)}`;
                    const her = drag?.maal === nokkel ? drag : null;
                    const forhandBit = her && bitPaaDag({ id: "forhand", start: her.start, slutt: her.slutt }, d);
                    const forhand =
                      her && (her.heileDagen ? { fra: fraTime, til: tilTime } : forhandBit && innanfor(klokketimar(forhandBit, d), fraTime, tilTime));
                    return (
                      <td key={isoDato(d)} className={`kal-celle${erIDag(d) ? " i-dag" : ""}${erHelg(d) ? " helg" : ""}${her ? " slepp-her" : ""}`}>
                        <div
                          className={`kal-spor${kanRedigere ? " ledig" : ""}`}
                          data-kal-celle=""
                          data-rad={r.id ?? ""}
                          data-dag={isoDato(d)}
                          style={{ height: hogd }}
                        >
                          {timar.map((t) => (
                            <div
                              key={t}
                              className={`kal-rute${erArbeidstime(d, t) ? " arbeid" : ""}`}
                              title={kanRedigere ? `${String(t).padStart(2, "0")}:00 – ledig` : undefined}
                              onClick={() => {
                                if (rettEtterDrag()) return;
                                onNy({ start: settKl(d, t), slutt: settKl(d, t + 1), deltakarar: r.id ? [r.id] : [], kind: r.id ? "oppdrag" : "mote" });
                              }}
                            />
                          ))}
                          {iDag.map(({ h, fra, til, linje }) => (
                            <button
                              key={h.id}
                              type="button"
                              className={`kal-brikke kal-stolpe ${h.kind}${kanRedigere ? " flyttbar" : ""}${drag?.id === h.id ? " drar" : ""}`}
                              style={{
                                left: `calc(${pst(fra)} + 1px)`,
                                width: `calc(${((til - fra) / tal) * 100}% - 2px)`,
                                top: 3 + linje * LINJE_PX,
                                height: LINJE_PX - 3,
                              }}
                              title={`${brikkeTid(h, d)}\n${brikkeTittel(h)}`}
                              onPointerDown={
                                kanRedigere
                                  ? (e) => {
                                      const spor = e.currentTarget.parentElement as HTMLElement;
                                      const t0 = timeVed(spor, e.clientX);
                                      startDrag(e, {
                                        flytt: (ev) => setDrag(nyPlass(h, d, t0, ev)),
                                        slepp: (ev) => {
                                          setDrag(null);
                                          slepp(h, r.id, nyPlass(h, d, t0, ev));
                                        },
                                        avbryt: () => setDrag(null),
                                      });
                                    }
                                  : undefined
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!rettEtterDrag()) onVelg(h);
                              }}
                            >
                              <span className="kal-brikke-tittel">
                                {h.order && <span className="kal-ordrenr">#{h.order.order_no} </span>}
                                {h.title}
                              </span>
                              <span className="kal-brikke-stad">
                                {brikkeTid(h, d)}
                                {h.order?.site_address ? ` · ${h.order.site_address}` : ""}
                              </span>
                            </button>
                          ))}
                          {forhand && her && (
                            <div
                              className="kal-stolpe forhand"
                              style={{ left: pst(forhand.fra), width: `${((forhand.til - forhand.fra) / tal) * 100}%`, top: 3, height: hogd - 6 }}
                            >
                              {her.heileDagen ? "" : klokke(her.start)}
                            </div>
                          )}
                        </div>
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
  fraTime,
  tilTime,
  filter,
  onVelg,
  onNy,
  onFlytt,
}: {
  dagar: Date[];
  hendingar: Hending[];
  kanRedigere: boolean;
  fraTime: number;
  tilTime: number;
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

  /** Plassen til eit tidsrom i dagskolonna, klipt til timane som er viste. Null når alt ligg utanfor. */
  const blokkStil = (fraKl: Date, tilKl: Date, dag: Date) => {
    const t = innanfor(klokketimar({ fraKl, tilKl }, dag), fraTime, tilTime);
    if (!t) return null;
    return { top: (t.fra - fraTime) * TIME_PX, height: Math.max((t.til - t.fra) * TIME_PX, 22) - 2 };
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
              const forhandStil = forhand && blokkStil(forhand.start, forhand.slutt, d);
              return (
                <div
                  key={isoDato(d)}
                  data-kal-dag={isoDato(d)}
                  className={`kal-uke-kolonne${kanRedigere ? " ledig" : ""}${erIDag(d) ? " i-dag" : ""}${erHelg(d) ? " helg" : ""}`}
                  style={{ backgroundSize: `100% ${TIME_PX}px` }}
                  onClick={(e) => {
                    if (rettEtterDrag()) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    const halvtimar = Math.floor(y / (TIME_PX / 2));
                    const start = settKl(d, fraTime + Math.floor(halvtimar / 2), (halvtimar % 2) * 30);
                    onNy({ start, slutt: new Date(start.getTime() + 2 * 3_600_000), deltakarar: filter ? [filter] : [] });
                  }}
                >
                  {!erHelg(d) && (
                    <div
                      className="kal-uke-arbeid"
                      style={{ top: (ARBEID_FRA - fraTime) * TIME_PX, height: (ARBEID_TIL - ARBEID_FRA) * TIME_PX }}
                    />
                  )}
                  {erIDag(d) && <NoLinje fraTime={fraTime} tilTime={tilTime} />}
                  {bitar.map((b) => {
                    const p = plass.get(b.id) ?? { kolonne: 0, kolonnar: 1 };
                    const flyttbar = kanRedigere && eiDag(b);
                    const stil = blokkStil(b.fraKl, b.tilKl, d);
                    if (!stil) return null;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`kal-blokk ${b.kind}${flyttbar ? " flyttbar" : ""}${drag?.id === b.id ? " drar" : ""}`}
                        style={{
                          ...stil,
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
                  {forhand && forhandStil && (
                    <div className="kal-blokk forhand" style={{ ...forhandStil, left: 2, right: 2 }}>
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
