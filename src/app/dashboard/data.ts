import type { Intervall } from "@/lib/billing/katalog";
import { leggTilMaanader, type Periode } from "@/lib/billing/subscription";
import type { KalenderHending } from "@/lib/kalender/hent";
import { datoarMellom, osloDag, osloDato, pluss } from "@/lib/kalender/oslo";
import type { HendingType } from "@/lib/kalender/tid";

/**
 * Det dashboardet teiknar, rekna ut frå radene. Reine funksjonar — sida
 * hentar, desse formar, og visninga kan fyllast med eksempeldata.
 */

const TZ = "Europe/Oslo";
const DAG_MS = 24 * 60 * 60 * 1000;

export interface DashHending {
  id: string;
  kind: HendingType;
  tittel: string;
  /** «08:00», «Hele dagen» eller «Fortsetter». */
  tid: string;
  kven: string;
  ordreNr: number | null;
}

export interface DashDag {
  /** «2026-11-14» */
  dato: string;
  /** «lør.» */
  vekedag: string;
  /** «14» */
  dag: string;
  idag: boolean;
  helg: boolean;
  hendingar: DashHending[];
}

function klokkeOslo(t: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}

/** Dei neste `antal` dagane frå og med `idag`, med avtalane som fell på kvar dag. Norsk tid. */
export function kalenderDagar(hendingar: KalenderHending[], idag: string, antal = 7): DashDag[] {
  return datoarMellom(idag, pluss(idag, antal - 1)).map((dato) => {
    const { start, slutt } = osloDag(dato);
    const midt = new Date((start.getTime() + slutt.getTime()) / 2);
    const vekedagNr = new Date(`${dato}T12:00:00Z`).getUTCDay();
    const paaDagen = hendingar
      .map((h) => ({ h, fra: new Date(h.starts_at), til: new Date(h.ends_at) }))
      .filter(({ fra, til }) => fra < slutt && til > start)
      .map(({ h, fra, til }) => {
        const heile = h.all_day || (fra <= start && til >= slutt);
        return {
          heile,
          fra,
          rad: {
            id: h.id,
            kind: h.kind,
            tittel: h.title,
            tid: heile ? "Hele dagen" : fra < start ? "Fortsetter" : klokkeOslo(fra),
            kven: h.deltakarar.map((d) => d.navn.split(" ")[0]).join(", "),
            ordreNr: h.order?.order_no ?? null,
          } satisfies DashHending,
        };
      })
      .sort((a, b) => Number(b.heile) - Number(a.heile) || a.fra.getTime() - b.fra.getTime());
    return {
      dato,
      vekedag: new Intl.DateTimeFormat("nb-NO", { timeZone: TZ, weekday: "short" }).format(midt),
      dag: String(Number(dato.slice(8))),
      idag: dato === idag,
      helg: vekedagNr === 0 || vekedagNr === 6,
      hendingar: paaDagen.map((p) => p.rad),
    };
  });
}

export interface DashSoyle {
  /** Heile namnet, til hjelpeteksten: «14. november» eller «november 2026». */
  namn: string;
  /** Kort, til aksen: «14. nov.» eller «nov.». */
  kort: string;
  tilbud: number;
  faktura: number;
  /** Søyla dagen i dag fell i. */
  no: boolean;
  /** Ikkje komen enno. */
  framtid: boolean;
}

/**
 * Forbruket fordelt utover perioden: éi søyle per dag i ein månadsperiode,
 * éi per periodemånad i ein årsperiode.
 */
export function aktivitet(
  hendingar: { kind: string; quantity: number | null; created_at: string }[],
  periode: Periode,
  interval: Intervall,
  no: Date = new Date(),
): DashSoyle[] {
  let grenser: { start: Date; slutt: Date; namn: string; kort: string }[];
  if (interval === "aar") {
    grenser = [];
    for (let i = 0; i < 12; i++) {
      const start = leggTilMaanader(periode.start, i);
      if (start >= periode.slutt) break;
      const slutt = leggTilMaanader(periode.start, i + 1);
      const fmt = (t: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nb-NO", { timeZone: TZ, ...o }).format(t);
      grenser.push({
        start,
        slutt,
        namn: `${fmt(start, { day: "numeric", month: "long" })} – ${fmt(new Date(slutt.getTime() - 1), { day: "numeric", month: "long" })}`,
        kort: fmt(start, { month: "short" }),
      });
    }
  } else {
    // Dagar i norsk tid, klipte til perioden i begge endar.
    grenser = datoarMellom(osloDato(periode.start), osloDato(new Date(periode.slutt.getTime() - 1))).map((dato) => {
      const dag = osloDag(dato);
      const midt = new Date(dag.start.getTime() + DAG_MS / 2);
      const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nb-NO", { timeZone: TZ, ...o }).format(midt);
      return {
        start: dag.start < periode.start ? periode.start : dag.start,
        slutt: dag.slutt > periode.slutt ? periode.slutt : dag.slutt,
        namn: fmt({ weekday: "long", day: "numeric", month: "long" }),
        kort: fmt({ day: "numeric", month: "short" }),
      };
    });
  }

  const soyler: DashSoyle[] = grenser.map((g) => ({
    namn: g.namn,
    kort: g.kort,
    tilbud: 0,
    faktura: 0,
    no: no >= g.start && no < g.slutt,
    framtid: g.start > no,
  }));
  for (const h of hendingar) {
    if (h.kind !== "tilbud" && h.kind !== "faktura") continue;
    const tid = new Date(h.created_at);
    const i = grenser.findIndex((g) => tid >= g.start && tid < g.slutt);
    if (i === -1) continue;
    soyler[i][h.kind] += Number(h.quantity ?? 1);
  }
  return soyler;
}

/** Kor langt perioden er komen: «dag 12 av 31». */
export function periodeframdrift(periode: Periode, no: Date = new Date()): { dag: number; dagar: number; igjen: number; del: number } {
  const dagar = Math.max(1, Math.round((periode.slutt.getTime() - periode.start.getTime()) / DAG_MS));
  const gaatt = Math.min(Math.max(no.getTime() - periode.start.getTime(), 0), periode.slutt.getTime() - periode.start.getTime());
  return {
    dag: Math.min(dagar, Math.floor(gaatt / DAG_MS) + 1),
    dagar,
    igjen: Math.max(0, Math.ceil((periode.slutt.getTime() - no.getTime()) / DAG_MS)),
    del: gaatt / (periode.slutt.getTime() - periode.start.getTime()),
  };
}
