/**
 * Pakkekatalogen — grunnpris + pris per eining.
 *
 * Éi pakke per selskap. Modellen er PowerOffice Go sin: låg grunnpris,
 * pris per tilbud generert, per faktura overført og per aktiv montør i
 * appen, pluss ein førehandsbetalt årspakke (Mikro) for dei minste.
 * Kontorbrukarar i nettappen er gratis og uavgrensa.
 *
 * Katalogen ligg i koden, ikkje i databasen, fordi han er ei produktavgjerd
 * som skal gjennom ein kodegjennomgang. Det selskapet faktisk har avtalt
 * ligg i databasen: pris, inkluderte einingar og einingsprisar blir kopierte
 * inn på abonnementsrada når pakken blir vald, så ei prisendring her aldri
 * rører ei løpande avtale.
 *
 * Nettsida devello.no/priser skal seie det same som dette. Teksten sida
 * skal ha, står i docs/priser-tekst.md — nettsida er løftet, dette er
 * rekninga.
 */

export type ModulId = "tilbud" | "ordre"; // same som lib/moduler.ts
export type EiningSlag = "tilbud" | "faktura";
export type PakkeId = "tilbud" | "ordre" | "plattform" | "mikro";
export type Intervall = "maanad" | "aar";

export interface Pakke {
  id: PakkeId;
  name: string;
  /** Kven pakken er for. Same ordlyd som devello.no/priser. */
  tagline: string;
  moduler: ModulId[];
  interval: Intervall;
  /** Grunnpris per periode, eks. mva. */
  priceNok: number;
  /** Einingar inkluderte per periode, samla for tilbud + faktura. 0 = ingen. */
  includedUnits: number;
  /** Kroner per eining over dei inkluderte, per slag. */
  unitPriceNok: Record<EiningSlag, number>;
  /** Montørar i appen inkluderte per periode. */
  includedAppUsers: number;
  /** Kroner per aktiv montør per MÅNAD over dei inkluderte. */
  appUserPriceNok: number;
}

export const PAKKAR: Pakke[] = [
  {
    id: "tilbud",
    name: "Tilbud",
    tagline: "Tilbudsagenten: fra innboks til ferdig tilbud",
    moduler: ["tilbud"],
    interval: "maanad",
    priceNok: 390,
    includedUnits: 0,
    unitPriceNok: { tilbud: 29, faktura: 0 },
    includedAppUsers: 0,
    appUserPriceNok: 0,
  },
  {
    id: "ordre",
    name: "Ordre",
    tagline: "Ordre, timer, materiell og faktura",
    moduler: ["ordre"],
    interval: "maanad",
    priceNok: 490,
    includedUnits: 0,
    unitPriceNok: { tilbud: 0, faktura: 9 },
    includedAppUsers: 0,
    appUserPriceNok: 59,
  },
  {
    id: "plattform",
    name: "Tilbud + Ordre",
    tagline: "Hele plattformen, fra henvendelse til faktura",
    moduler: ["tilbud", "ordre"],
    interval: "maanad",
    priceNok: 690,
    includedUnits: 0,
    unitPriceNok: { tilbud: 29, faktura: 9 },
    includedAppUsers: 0,
    appUserPriceNok: 59,
  },
  {
    // Mikro er ein årspakke. Dei 100 einingane og den eine montøren er
    // inkluderte for heile året — men montørar UTOVER den eine kostar 59 kr
    // per MÅNAD dei er aktive, ikkje per år. Teljinga er derfor per
    // kalendermånad innanfor årsperioden: kvar månad tel vi aktive
    // montørar, trekkjer frå den inkluderte, og summerer. Sjå
    // subscription.ts (forbruk.appBrukarMaanadar).
    id: "mikro",
    name: "Mikro",
    tagline: "Enkeltpersonforetak og små firma — betales årlig",
    moduler: ["tilbud", "ordre"],
    interval: "aar",
    priceNok: 2490,
    includedUnits: 100,
    unitPriceNok: { tilbud: 29, faktura: 29 },
    includedAppUsers: 1,
    appUserPriceNok: 59,
  },
];

export function finnPakke(id: string | null | undefined): Pakke | null {
  if (!id) return null;
  return PAKKAR.find((p) => p.id === id) ?? null;
}

/**
 * Adressa «kontakt oss for større pakke» går til.
 *
 * ⚠️ Må vere ei postkasse nokon faktisk les. Lenka står ved sida av
 * pakkane, så den som trykkjer er ein kunde med meir volum enn katalogen
 * dekkjer — det er ikkje førespurnaden å la liggje.
 */
export const KONTAKT_EPOST = "post@devello.no";

export function formatPrice(nok: number): string {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(nok);
}

/** Dagar igjen av prøveperioden. Negativt tal tyder at ho er ute. */
export function trialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
