import type { MaterialEntry, TimeEntry } from "@/lib/types";

/**
 * Summene på en ordre: timer og materiell.
 *
 * Rene funksjoner over føringene, uten database, så de kan prøves — og så
 * Oversikt-fanen, Timer-fanen og fakturaforslaget i steg 4 regner likt.
 * Avrundingen er den samme som i computeTotals: to desimaler, én gang på
 * slutten av hver sum, aldri per linje.
 */

export interface Timesum {
  timar: number;
  kr: number;
  perType: { name: string; timar: number; kr: number }[];
}

export interface Materiellsum {
  /** Sum kostpris eks. mva. Linjer uten kostpris teller 0 her. */
  kost: number;
  /** Sum salgspris eks. mva. */
  sal: number;
  linjer: number;
}

export function summerTimar(
  entries: Pick<TimeEntry, "hours" | "unit_price" | "time_type_name">[],
): Timesum {
  let timar = 0;
  let kr = 0;
  const perType = new Map<string, { timar: number; kr: number }>();
  for (const e of entries) {
    const t = Number(e.hours);
    const sum = t * Number(e.unit_price);
    timar += t;
    kr += sum;
    const f = perType.get(e.time_type_name) ?? { timar: 0, kr: 0 };
    f.timar += t;
    f.kr += sum;
    perType.set(e.time_type_name, f);
  }
  return {
    timar: round2(timar),
    kr: round2(kr),
    perType: [...perType.entries()]
      .map(([name, f]) => ({ name, timar: round2(f.timar), kr: round2(f.kr) }))
      .sort((a, b) => b.kr - a.kr),
  };
}

export function summerMateriell(
  entries: Pick<MaterialEntry, "quantity" | "cost_price" | "sale_price">[],
): Materiellsum {
  let kost = 0;
  let sal = 0;
  for (const e of entries) {
    const q = Number(e.quantity);
    kost += q * Number(e.cost_price ?? 0);
    sal += q * Number(e.sale_price);
  }
  return { kost: round2(kost), sal: round2(sal), linjer: entries.length };
}

/** Salgspris fra kostpris og påslag, to desimaler. Én formel for API og UI. */
export function salspris(kost: number, paaslagPct: number): number {
  return round2(kost * (1 + paaslagPct / 100));
}

/** Påslaget som svarer til en gitt salgspris, når kostprisen er kjent. */
export function paaslagFraSalspris(kost: number, sal: number): number {
  if (!(kost > 0)) return 0;
  return round2((sal / kost - 1) * 100);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
