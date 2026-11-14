import type { StockMovement } from "@/lib/types";

/**
 * Behaldninga i ein bil, rekna frå rørslene.
 *
 * Reine funksjonar utan database, så dei kan prøvast — og så lagersida,
 * «frå bil»-veljaren på ordren og API-et reknar likt.
 *
 * Ei vare er elnummeret når ho har eitt. Utan nummer (fritekst) er ho namnet
 * og eininga, utan omsyn til store og små bokstavar. Då hamnar same vare på
 * same linje same kvar ho kom frå: katalogen, ei faktura eller ei hand.
 */

export interface Lagervare {
  /** Stabil nøkkel for vara i denne bilen. Sendast tilbake ved uttak og teljing. */
  key: string;
  item_no: string | null;
  name: string;
  unit: string;
  supplier_item_id: string | null;
  /** Det som ligg i bilen no. Kan vere negativt: det er teke ut meir enn det er ført inn. */
  quantity: number;
  /** Siste kjende innpris per eining eks. mva. Null når ingen rørsle har hatt pris. */
  cost_price: number | null;
  /** quantity × cost_price. 0 utan pris eller med negativ behaldning. */
  verdi: number;
  sist_endra: string;
}

type Roersle = Pick<
  StockMovement,
  "item_no" | "name" | "unit" | "supplier_item_id" | "quantity" | "cost_price" | "kind" | "created_at"
>;

export function lagerNokkel(v: { item_no: string | null; name: string; unit: string }): string {
  const nr = (v.item_no ?? "").trim();
  if (nr) return `nr:${nr}`;
  return `namn:${v.name.trim().toLowerCase()}|${v.unit.trim().toLowerCase()}`;
}

/**
 * Summerer rørslene per vare. Namn, eining og pris kjem frå den nyaste
 * rørsla som har dei: det siste innkjøpet er det som gjeld.
 */
export function reknBehaldning(roersler: Roersle[], opts: { medTomme?: boolean } = {}): Lagervare[] {
  const sortert = [...roersler].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const varer = new Map<string, Lagervare>();

  for (const r of sortert) {
    const key = lagerNokkel(r);
    const q = Number(r.quantity);
    const v = varer.get(key) ?? {
      key,
      item_no: r.item_no?.trim() || null,
      name: r.name,
      unit: r.unit,
      supplier_item_id: null,
      quantity: 0,
      cost_price: null,
      verdi: 0,
      sist_endra: r.created_at,
    };
    v.quantity += q;
    v.sist_endra = r.created_at;
    // Innkjøp og påfyll avgjer korleis vara heiter og kva ho kostar.
    if (q > 0) {
      v.name = r.name;
      v.unit = r.unit;
      if (r.cost_price !== null && r.cost_price !== undefined) v.cost_price = Number(r.cost_price);
    } else if (v.cost_price === null && r.cost_price !== null && r.cost_price !== undefined) {
      v.cost_price = Number(r.cost_price);
    }
    if (r.supplier_item_id) v.supplier_item_id = r.supplier_item_id;
    varer.set(key, v);
  }

  const ut: Lagervare[] = [];
  for (const v of varer.values()) {
    v.quantity = round3(v.quantity);
    if (v.quantity === 0 && !opts.medTomme) continue;
    v.verdi = v.cost_price !== null && v.quantity > 0 ? round2(v.quantity * v.cost_price) : 0;
    ut.push(v);
  }
  return ut.sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/** Samla verdi av det som ligg i bilen, eks. mva. */
export function lagerverdi(varer: Lagervare[]): number {
  return round2(varer.reduce((sum, v) => sum + v.verdi, 0));
}

/** Rørsla som gjer behaldninga lik det som vart talt. 0 når talet stemmer. */
export function teljedifferanse(naa: number, talt: number): number {
  return round3(talt - naa);
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
