/**
 * Prisfilvask — funnene i en prisliste som et menneske må ta stilling til.
 *
 * Bakgrunn: Star Elektros prisliste har 247 aktive rader. 61 står til 0 kr og
 * 16 over 20 000. De fleste nullradene er ikke priser i det hele tatt — det er
 * overskriftene fra NS-strukturen («Punktpriser», «Solcelleanlegg»,
 * «Varmepumpe») som fulgte med da regnearket ble importert som om hver linje
 * var en vare. Noen av dem er derimot helt riktige: «Samsvarserklæring for
 * utført arbeid» står til 0 med vilje og er med i alle seks tilbudene firmaet
 * har sendt.
 *
 * Koden kan ikke se forskjell på de to, og skal ikke prøve. Den finner radene,
 * grupperer dem, og lar brukeren avgjøre. Det er forskjellen på et verktøy som
 * hjelper og et som gjetter.
 *
 * Ingen database, ingen modellkall — ren funksjon over rader, så den kan
 * brukes både på det som ligger inne (Prisfil-siden) og på det som er i ferd
 * med å importeres (excel.ts).
 */

export interface VaskRad {
  /** Radens id når den ligger i basen. null under import. */
  id?: string | null;
  name: string;
  unit: string;
  unit_price: number;
}

export type FunnType =
  /** Pris 0. Enten «inkludert uten tillegg» eller en overskrift. */
  | "uten_pris"
  /** Prisen ligger vilt utenfor resten av listen. Ofte en jobbsum. */
  | "uteligger"
  /** Samme navn flere ganger. Agenten kan velge feil av to. */
  | "duplikat";

export interface Funn {
  type: FunnType;
  /** Radene funnet gjelder. */
  rader: VaskRad[];
  /** Én setning som sier hva som er observert — aldri hva som er galt. */
  tekst: string;
  /** Hva brukeren kan gjøre. Kortene i UI-et bruker disse som knapper. */
  valg: string[];
}

export interface Vask {
  antallRader: number;
  funn: Funn[];
  /** Rader uten funn. Vises ikke, men tallet gir brukeren proporsjonene. */
  reine: number;
}

/**
 * Hvor mange ganger medianen en pris må være før vi kaller den en uteligger.
 * Satt høyt med vilje: en prisliste skal kunne inneholde både en stikkontakt
 * og en hovedfordeling uten at vi maser. Star Elektros «Autrosafe System» til
 * 911 300 mot en median rundt 1 500 treffer uansett.
 */
const UTELIGGER_FAKTOR = 25;

export function vaskPrisliste(rader: VaskRad[]): Vask {
  const funn: Funn[] = [];
  const merket = new Set<VaskRad>();

  // 1. Rader uten pris.
  const utenPris = rader.filter((r) => Number(r.unit_price) === 0);
  if (utenPris.length > 0) {
    for (const r of utenPris) merket.add(r);
    funn.push({
      type: "uten_pris",
      rader: utenPris,
      tekst:
        utenPris.length === 1
          ? "Én rad står til 0 kr."
          : `${utenPris.length} rader står til 0 kr.`,
      valg: [
        "Inkludert i jobben — skal stå til 0",
        "Mangler pris — sett pris nå",
        "Ikke en prisrad — fjern fra listen",
      ],
    });
  }

  // 2. Utliggere, målt mot medianen av radene som faktisk har en pris.
  const medPris = rader.filter((r) => Number(r.unit_price) > 0);
  const midt = median(medPris.map((r) => Number(r.unit_price)));
  if (midt > 0) {
    const uteliggere = medPris
      .filter((r) => Number(r.unit_price) > midt * UTELIGGER_FAKTOR)
      .sort((a, b) => Number(b.unit_price) - Number(a.unit_price));
    if (uteliggere.length > 0) {
      for (const r of uteliggere) merket.add(r);
      funn.push({
        type: "uteligger",
        rader: uteliggere,
        tekst:
          `${uteliggere.length === 1 ? "Én rad ligger" : `${uteliggere.length} rader ligger`} ` +
          `mer enn ${UTELIGGER_FAKTOR} ganger over medianprisen i listen (${kr(midt)}). ` +
          "Det er ofte totalsummen fra én gammel jobb som er limt inn som en enhetspris.",
        valg: [
          "Riktig enhetspris — la stå",
          "Dette var en jobbsum — fjern fra listen",
          "Sett riktig pris nå",
        ],
      });
    }
  }

  // 3. Duplikater. To rader med samme navn betyr at agenten kan velge den
  //    ene eller den andre, og valget er vilkårlig.
  const grupper = new Map<string, VaskRad[]>();
  for (const r of rader) {
    const n = normaliser(r.name);
    if (!n) continue;
    const liste = grupper.get(n);
    if (liste) liste.push(r);
    else grupper.set(n, [r]);
  }
  const duplikat = [...grupper.values()].filter((g) => g.length > 1);
  if (duplikat.length > 0) {
    const flate = duplikat.flat();
    for (const r of flate) merket.add(r);
    funn.push({
      type: "duplikat",
      rader: flate,
      tekst:
        `${duplikat.length === 1 ? "Ett navn finnes" : `${duplikat.length} navn finnes`} ` +
        "på flere rader. Agenten velger én av dem, og valget er vilkårlig.",
      valg: ["Behold én — fjern de andre", "De er ulike — gi dem ulike navn"],
    });
  }

  return {
    antallRader: rader.length,
    funn: funn.sort((a, b) => b.rader.length - a.rader.length),
    reine: rader.length - merket.size,
  };
}

/** Én linje til toppen av panelet, eller null når listen er ren. */
export function vaskSamandrag(vask: Vask): string | null {
  if (vask.funn.length === 0) return null;
  const deler = vask.funn.map((f) => {
    if (f.type === "uten_pris") return `${f.rader.length} uten pris`;
    if (f.type === "uteligger") return `${f.rader.length} med uvanlig høy pris`;
    return `${f.rader.length} med samme navn som en annen rad`;
  });
  return `${vask.antallRader} rader, hvorav ${deler.join(", ")}. Resten ser greie ut.`;
}

function median(tall: number[]): number {
  if (tall.length === 0) return 0;
  const sortert = [...tall].sort((a, b) => a - b);
  const midt = Math.floor(sortert.length / 2);
  return sortert.length % 2 === 1 ? sortert[midt] : (sortert[midt - 1] + sortert[midt]) / 2;
}

function normaliser(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

function kr(n: number): string {
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(n)} kr`;
}
