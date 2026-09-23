import type { PriceListItem } from "@/lib/types";

/**
 * Kodene i prisfila.
 *
 * Kodene er ikke løpenumre — prefikset er kategorien. «B» er bad, «EL» er
 * elbillader, «K» er kjøkken, og postene under heter B001, B002, EL001 osv.
 * Hver kategori har som regel en overskriftsrad der koden bare er prefikset
 * («B» = «Bad») og prisen 0. Prisfila er sortert slik, og en ny post som får
 * feil kode, havner på feil sted og er vanskelig å finne igjen.
 */

export interface Kategori {
  /** Prefikset, med store bokstaver: «B», «EL», «SR». */
  prefiks: string;
  /** Navnet fra overskriftsraden. null når kategorien ikke har en. */
  navn: string | null;
  /** Antall poster i kategorien, uten overskriftsraden. */
  antall: number;
}

/** «el040» → «EL». null når koden ikke starter med bokstaver. */
export function prefiksAv(code: string | null | undefined): string | null {
  const treff = code?.trim().match(/^[A-Za-zÆØÅæøå]+/);
  return treff ? treff[0].toUpperCase() : null;
}

/** Koden slik den lagres: uten mellomrom rundt, og med store bokstaver. */
export function normaliserKode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * En overskriftsrad: bare bokstaver i koden, og ingen pris. Den deler inn
 * prisfila, men er ingen post man kan legge i et tilbud.
 */
export function erOverskrift(item: Pick<PriceListItem, "code" | "unit_price">): boolean {
  return Boolean(item.code && /^[A-Za-zÆØÅæøå]+$/.test(item.code.trim())) &&
    Number(item.unit_price) === 0;
}

/** Kategoriene i prisradene, i den rekkefølgen de først dukker opp. */
export function kategorierAv(items: PriceListItem[]): Kategori[] {
  const kategorier = new Map<string, Kategori>();
  for (const item of items) {
    const prefiks = prefiksAv(item.code);
    if (!prefiks) continue;
    const kategori = kategorier.get(prefiks) ?? { prefiks, navn: null, antall: 0 };
    if (erOverskrift(item) && item.code!.trim().toUpperCase() === prefiks) {
      kategori.navn ??= item.name;
    } else {
      kategori.antall += 1;
    }
    kategorier.set(prefiks, kategori);
  }
  return [...kategorier.values()];
}

/**
 * Neste ledige kode i en kategori: høyeste nummer + 1. B001…B022 gir B023.
 *
 * Antall sifre er det kategorien bruker mest. Noen kategorier har varianter
 * med et siffer ekstra — PT003 og PT0031 — og da er det hovedpostene med tre
 * sifre som bestemmer, ellers ville neste post blitt en variant. Varianter som
 * «P001,02» eller «N411-10» teller som hovednummeret sitt. En tom kategori
 * starter på 001.
 */
export function nesteKode(prefiks: string, items: PriceListItem[]): string {
  const p = prefiks.toUpperCase();
  const numre: string[] = [];
  for (const item of items) {
    const code = item.code?.trim().toUpperCase();
    if (!code || prefiksAv(code) !== p) continue;
    const tall = code.slice(p.length).match(/^\d+/);
    if (tall) numre.push(tall[0]);
  }

  const perBredde = new Map<number, number>();
  for (const n of numre) perBredde.set(n.length, (perBredde.get(n.length) ?? 0) + 1);
  // Flest vinner; ved likt antall den korteste, som er hovedpostene.
  const sifre =
    [...perBredde.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 3;

  const hoyest = Math.max(0, ...numre.filter((n) => n.length === sifre).map(Number));
  return `${p}${String(hoyest + 1).padStart(Math.max(sifre, 3), "0")}`;
}

/** Finnes koden fra før? Store og små bokstaver er det samme. */
export function kodeFinnes(code: string, items: PriceListItem[]): boolean {
  const c = normaliserKode(code);
  return items.some((item) => item.code?.trim().toUpperCase() === c);
}

/**
 * Kategorien som passer til en seksjon, ut fra overskriften: seksjonen «Bad»
 * gir kategorien «Bad». null når ingen passer — da må brukeren velge.
 */
export function kategoriForSeksjon(
  seksjonstittel: string,
  kategorier: Kategori[],
): Kategori | null {
  const tittel = seksjonstittel.trim().toLowerCase();
  if (!tittel) return null;
  return (
    kategorier.find((k) => {
      const navn = k.navn?.trim().toLowerCase();
      return Boolean(navn) && (tittel.includes(navn!) || navn!.includes(tittel));
    }) ?? null
  );
}
