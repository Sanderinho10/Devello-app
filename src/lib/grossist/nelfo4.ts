import JSZip from "jszip";

/**
 * EFO/NELFO Vareformat 4.0 — grossistenes varefil.
 *
 * Kilde: NHO Elektro, «E-NVare4.0r4». Semikolonseparert tekst, CR+LF,
 * Windows-1252. Fila starter med én header (VH for varefil, PH for
 * kundespesifikt pristilbud), så én varelinje (VL/PL) per vare, med
 * valgfrie tilleggsposter (VX/PX) og alternativposter (VA/PA) rett etter
 * linja de hører til.
 *
 * Dette er en ren funksjon: bytes inn, linjer ut. Ingen database. Alt som
 * gjelder ett selskap eller én grossist hører hjemme i importscriptet.
 *
 * Den ene regnestykket som gjøres her, er omregningen til pris per
 * måleenhet: fila priser kabel per 100 meter (PrisEnhet HMT, Mengde
 * 1000000 = 100,0000), montøren fører meter. list_price_per_unit er tallet
 * appen bruker; listPrice og qtyPerPriceUnit står igjen så det kan
 * kontrolleres mot fila.
 */

export type Nelfo4Enhet = "stk" | "m" | "l" | "kg";

export interface Nelfo4Header {
  format: string;
  versjon: string;
  /** SelgersID — grossistens organisasjonsnummer. */
  sellerId: string;
  /** KundeNr — vårt kundenummer hos grossisten. */
  customerNo: string;
  /** FraDato som ISO-dato (YYYY-MM-DD), eller null. */
  fromDate: string | null;
  currency: string;
  sellerName: string;
}

export interface Nelfo4Line {
  /** VareMrk: 0 ukjent, 1 elnr, 2 EAN, 3 fabrikant, 4 NRF, 9 tillegg. */
  itemKind: number;
  itemNo: string;
  name: string;
  unit: Nelfo4Enhet;
  /** UN-kode for prisenheten: EA, MTR, HMT … */
  priceUnit: string | null;
  /** Hvor mange måleenheter én prisenhet dekker. 100 for HMT. */
  qtyPerPriceUnit: number;
  /** Pris per prisenhet, slik fila sier. */
  listPrice: number;
  /** Pris per måleenhet — det appen bruker. */
  listPricePerUnit: number;
  priceDate: string | null;
  /** 0 uendret, 1 ny, 2 endret, 3 utgått. */
  status: number;
  discountGroup: string | null;
  brand: string | null;
  productType: string | null;
  stocked: boolean | null;
  salesPack: number | null;
  blockNo: string | null;
  /** Bare PL-linjer. */
  discountPct?: number;
  priceType?: "B" | "N";
  netPricePerUnit?: number;
  gtin?: string;
}

export interface Nelfo4Fil {
  header: Nelfo4Header;
  lines: Nelfo4Line[];
  warnings: string[];
}

const ENHET: Record<string, Nelfo4Enhet> = { "1": "stk", "2": "m", "3": "l", "4": "kg" };

const MAKS_AATVARINGAR = 200;

/**
 * Leser en varefil eller et pristilbud. Tar imot rå bytes — fila kan være
 * en .zip med tekstfila inni, og tekstfila er Windows-1252, aldri UTF-8.
 */
export async function parseNelfo4(
  bytes: Uint8Array | ArrayBuffer,
  filnavn = "",
): Promise<Nelfo4Fil> {
  const tekst = await dekod(bytes, filnavn);
  return parseNelfo4Tekst(tekst);
}

/** Som parseNelfo4, men på ferdig dekodet tekst. Brukt av testene. */
export function parseNelfo4Tekst(tekst: string): Nelfo4Fil {
  const linjer = tekst.split(/\r\n|\n|\r/).filter((l) => l.length > 0);
  if (linjer.length === 0) throw new Error("Fila er tom.");

  const foersteFelt = felt(linjer[0]);
  if (
    (foersteFelt[0] !== "VH" && foersteFelt[0] !== "PH") ||
    (foersteFelt[1] ?? "").toUpperCase() !== "EFONELFO"
  ) {
    throw new Error(
      "Kjenner ikke igjen formatet — venter en VH/PH-header med EFONELFO. " +
        "De tre første linjene:\n" +
        linjer.slice(0, 3).join("\n"),
    );
  }

  const header: Nelfo4Header = {
    format: foersteFelt[1] ?? "",
    versjon: foersteFelt[2] ?? "",
    sellerId: foersteFelt[3] ?? "",
    customerNo: foersteFelt[5] ?? "",
    fromDate: dato(foersteFelt[6]),
    currency: foersteFelt[8] ?? "",
    sellerName: foersteFelt[10] ?? "",
  };

  const warnings: string[] = [];
  const advar = (melding: string) => {
    if (warnings.length < MAKS_AATVARINGAR) warnings.push(melding);
  };

  // Nøkkelen per fil er PostType + VareMrk + VareNr. Dukker samme vare opp
  // to ganger, vinner den siste — men vi sier fra.
  const linjerPerNokkel = new Map<string, Nelfo4Line>();
  let siste: Nelfo4Line | null = null;

  for (let i = 1; i < linjer.length; i++) {
    const f = felt(linjer[i]);
    const type = f[0];
    const radnr = i + 1;

    if (type === "VL" || type === "PL") {
      const linje = lesVarelinje(f, radnr, advar);
      if (!linje) continue;
      const nokkel = `${linje.itemKind}:${linje.itemNo}`;
      if (linjerPerNokkel.has(nokkel)) {
        advar(`Rad ${radnr}: varen ${linje.itemNo} står flere ganger — den siste vinner.`);
      }
      linjerPerNokkel.set(nokkel, linje);
      siste = linje;
    } else if (type === "VA" || type === "PA") {
      // Alternativpost: VaType V + VareMrk 2 er varens GTIN. Resten hopper
      // vi over i dette steget.
      if (siste && f[3] === "V" && f[1] === "2" && f[2]) siste.gtin = f[2];
    } else if (type === "VX" || type === "PX") {
      // Tilleggsinfo (dimensjon, vekt, bilde …). Ikke i bruk ennå.
    } else if (type === "VH" || type === "PH") {
      advar(`Rad ${radnr}: en ekstra header midt i fila — hoppet over.`);
    } else {
      advar(`Rad ${radnr}: ukjent posttype «${type}» — hoppet over.`);
    }
  }

  return { header, lines: [...linjerPerNokkel.values()], warnings };
}

function lesVarelinje(
  f: string[],
  radnr: number,
  advar: (m: string) => void,
): Nelfo4Line | null {
  const erPristilbud = f[0] === "PL";
  const itemNo = (f[2] ?? "").trim();
  if (!itemNo) {
    advar(`Rad ${radnr}: varelinje uten varenummer — hoppet over.`);
    return null;
  }

  const itemKind = heiltal(f[1]) ?? 0;
  const name = [f[3], f[4]].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  if (!name) advar(`Rad ${radnr}: ${itemNo} har ikke navn.`);

  let unit = ENHET[(f[5] ?? "").trim()];
  if (!unit) {
    advar(`Rad ${radnr}: ${itemNo} har ukjent måleenhet «${f[5]}» — satt til stk.`);
    unit = "stk";
  }

  const prisRaa = heiltal(f[8]);
  if (prisRaa === null) {
    advar(`Rad ${radnr}: ${itemNo} har ingen pris — hoppet over.`);
    return null;
  }
  const listPrice = prisRaa / 100;

  let qtyPerPriceUnit = (heiltal(f[9]) ?? 0) / 10000;
  if (!(qtyPerPriceUnit > 0)) {
    advar(`Rad ${radnr}: ${itemNo} har mengde 0 per prisenhet — regnet som 1.`);
    qtyPerPriceUnit = 1;
  }
  const listPricePerUnit = rund4(listPrice / qtyPerPriceUnit);

  const linje: Nelfo4Line = {
    itemKind,
    itemNo,
    name: name || itemNo,
    unit,
    priceUnit: tomTilNull(f[6]),
    qtyPerPriceUnit,
    listPrice,
    listPricePerUnit,
    priceDate: dato(f[10]),
    status: heiltal(f[11]) ?? 0,
    discountGroup: tomTilNull(f[13]),
    brand: tomTilNull(f[14]),
    productType: tomTilNull(f[15]),
    stocked: f[16] === "J" ? true : f[16] === "N" ? false : null,
    salesPack: heiltal(f[17]) === null ? null : (heiltal(f[17]) as number) / 10000,
    blockNo: tomTilNull(f[12]),
  };

  if (erPristilbud) {
    const pristype = (f[19] ?? "").trim().toUpperCase();
    const rabatt = (heiltal(f[18]) ?? 0) / 100;
    if (pristype === "N") {
      // Nettopris rett i prisfeltet. Rabatten er allerede trukket fra.
      linje.priceType = "N";
      linje.discountPct = 0;
      linje.netPricePerUnit = listPricePerUnit;
    } else {
      if (pristype !== "B") {
        advar(`Rad ${radnr}: ${itemNo} mangler pristype (B/N) — regnet som brutto.`);
      }
      linje.priceType = "B";
      linje.discountPct = rabatt;
      linje.netPricePerUnit = rund4(listPricePerUnit * (1 - rabatt / 100));
    }
  }

  return linje;
}

// ---------------------------------------------------------------------------
// Rabattfil
// ---------------------------------------------------------------------------

/**
 * Rabatt per rabattgruppe.
 *
 * Formatet er ikke publisert i samme spesifikasjon som varefila, og
 * grossistene varierer litt. Det vi vet: semikolonseparert, en header-linje
 * øverst, så «RabattGruppe;Rabatt» per linje — eventuelt med en posttype
 * først. Rabatten kan stå med to implisitte desimaler («2500» = 25 %) eller
 * med desimalkomma («25,00»).
 *
 * Kjenner vi ikke igjen fila, kaster vi en feil som siterer de tre første
 * linjene, så formatet kan tilpasses uten å gjette.
 */
export async function parseRabattfil(
  bytes: Uint8Array | ArrayBuffer,
  filnavn = "",
): Promise<Map<string, number>> {
  return parseRabattfilTekst(await dekod(bytes, filnavn));
}

export function parseRabattfilTekst(tekst: string): Map<string, number> {
  const linjer = tekst.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  const rabatter = new Map<string, number>();
  let ulesbare = 0;

  for (const linje of linjer) {
    const f = felt(linje);
    // Header-linjer: RH/PH/VH, eller en tekstoverskrift uten tall.
    if (/^(RH|PH|VH)$/i.test(f[0] ?? "")) continue;

    // Med posttype først (RL;gruppe;rabatt) eller uten (gruppe;rabatt).
    const harPosttype = /^[A-Z]{2}$/.test(f[0] ?? "") && f.length >= 3;
    const gruppe = (harPosttype ? f[1] : f[0])?.trim();
    const rabattTekst = (harPosttype ? f[2] : f[1])?.trim();
    const pct = lesProsent(rabattTekst);

    if (!gruppe || pct === null) {
      ulesbare += 1;
      continue;
    }
    rabatter.set(gruppe, pct);
  }

  // Én tekstoverskrift er greit; en fil der halvparten ikke gir mening, er
  // et annet format.
  if (rabatter.size === 0 || ulesbare > Math.max(1, rabatter.size)) {
    throw new Error(
      "Kjenner ikke igjen rabattfila — venter «RabattGruppe;Rabatt» per linje. " +
        "De tre første linjene:\n" +
        linjer.slice(0, 3).join("\n"),
    );
  }
  return rabatter;
}

/** «25,5» → 25.5 (desimaltegn); «2550» → 25.5 (heltall = to implisitte desimaler). */
function lesProsent(s: string | undefined): number | null {
  if (!s) return null;
  if (/^-?\d+[.,]\d+$/.test(s)) return Number(s.replace(",", "."));
  // Heltall uten desimaltegn: NELFO-konvensjonen er to implisitte desimaler.
  if (/^-?\d+$/.test(s)) return Number(s) / 100;
  return null;
}

// ---------------------------------------------------------------------------
// Bytes → tekst
// ---------------------------------------------------------------------------

/**
 * Pakker ut en zip om det er en, og dekoder som Windows-1252.
 *
 * UTF-8 er feil her selv om det ser ut til å virke: «ø» i et varenavn blir
 * til to tegn med spørsmålstegn, og søket finner ikke «kabelrør» lenger.
 */
async function dekod(bytes: Uint8Array | ArrayBuffer, filnavn: string): Promise<string> {
  let data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (erZip(data) || /\.zip$/i.test(filnavn)) {
    const zip = await JSZip.loadAsync(data);
    const kandidat = Object.values(zip.files).find(
      (fil) => !fil.dir && /\.(txt|csv)$/i.test(fil.name),
    );
    if (!kandidat) {
      throw new Error("Zip-fila inneholder ingen .txt- eller .csv-fil.");
    }
    data = await kandidat.async("uint8array");
  }

  return new TextDecoder("windows-1252").decode(data);
}

function erZip(data: Uint8Array): boolean {
  return data.length > 3 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

// ---------------------------------------------------------------------------
// Små hjelpere
// ---------------------------------------------------------------------------

function felt(linje: string): string[] {
  return linje.split(";");
}

function heiltal(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function tomTilNull(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

/** YYYYMMDD → YYYY-MM-DD. Alt annet → null. */
function dato(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function rund4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
