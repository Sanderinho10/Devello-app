/**
 * Fjerner personopplysninger før noe havner i læringsdataene.
 *
 * Referanselisten er agentens hukommelse, og den skal huske MØNSTERET — hvilke
 * poster som hører sammen, hvilke mengder som er vanlige, hvordan firmaet
 * ordlegger seg. Ingenting av det krever at kunden heter Halvard eller bor i
 * Eidsvågskogen 10. Da skal det ikke ligge der: et innbrudd i databasen vår
 * skal ikke bli et innbrudd i kundelisten til kundene våre.
 *
 * To lag, med vilje:
 *
 * 1. Mønstre. E-post, telefonnummer og adresser som står midt i en tekst vi
 *    ikke har strukturerte felter for — særlig i opplastede PDF-er, der vi
 *    ikke vet hvem kunden var.
 *
 * 2. Verdier vi VET. Navnet, adressen, telefonnummeret og e-posten står på
 *    leadet og i dokumentet. De byttes ut ordrett, og det er det presise
 *    laget — ingen gjetting, ingen bomskudd.
 *
 * Erstatningene er merkelapper og ikke tomrom. «Hei [kunde],» forteller
 * agenten at e-posten åpner med en hilsen; «Hei ,» forteller den at firmaet
 * skriver rart.
 */

export interface KjenteVerdier {
  navn?: string | null;
  kontakt?: string | null;
  epost?: string | null;
  telefon?: string | null;
  adresse?: string | null;
}

const EPOST = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/g;

/**
 * Norsk telefonnummer: åtte siffer, eventuelt med landkode og mellomrom.
 *
 * Kravet om åtte siffer er det som skiller det fra et beløp. «12 500» er fem
 * siffer og blir stående; «401 87 690» er ni med landkode og blir tatt. Et
 * beløp har dessuten «kr» ved siden av seg, og det har ikke et telefonnummer.
 */
const TELEFON =
  /(?<![\d.,])(?:\+47[\s-]?|0047[\s-]?)?(?:\d[\s-]?){7}\d(?![\d.,])/g;

/**
 * Postnummer og poststed: fire siffer og et stedsnavn.
 *
 * Bare når de fire sifrene står for seg selv. «Tilbud nr. 5101» skal ikke bli
 * en adresse, og en varekode midt i et ord skal ikke det heller.
 */
const POSTSTED =
  /(?<![\d.,\-/])\b\d{4}\b\s+[A-ZÆØÅ][a-zæøåA-ZÆØÅ-]{2,}(?:\s[A-ZÆØÅ][a-zæøå-]{2,})?/g;

/** Gateadresse: ord som slutter på vei/gate/veg… med husnummer etter. */
const GATE =
  /\b[A-ZÆØÅ][a-zæøåA-ZÆØÅ]*(?:vegen|veien|veg|vei|gata|gaten|gate|svingen|bakken|skogen|haugen|lia|toppen|plassen|stien|kroken|jordet)\s+\d+[A-Za-z]?\b/g;

export function anonymiser(
  tekst: string | null | undefined,
  kjente: KjenteVerdier = {},
): string {
  if (!tekst) return "";
  let ut = tekst;

  // Mønstrene går FØRST, og det er ikke tilfeldig.
  //
  // Kundens navn står ofte inne i e-postadressen hans. Byttet vi navnet først,
  // ble «halvard.langhelle@gmail.com» til «[kunde].[kunde]@gmail.com» — som
  // e-postmønsteret ikke lenger kjenner igjen, og domenet ble stående. Det er
  // slik en anonymisering lekker: ikke ved å glemme et felt, men ved å ødelegge
  // sitt eget mønster underveis.
  ut = ut.replace(EPOST, "[e-post]");
  ut = ut.replace(GATE, "[adresse]");
  ut = ut.replace(POSTSTED, "[adresse]");
  ut = ut.replace(TELEFON, "[telefon]");

  // Så det vi vet. Lengste navn først, ellers spiser «Ola» halve
  // «Ola Nordmann» og lar etternavnet stå igjen.
  const kjenteNavn = [kjente.navn, kjente.kontakt]
    .map((v) => (v ?? "").trim())
    .filter((v) => v.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const navn of kjenteNavn) {
    ut = ut.replaceAll(regexFor(navn), "[kunde]");
    // Også fornavnet alene: e-posten åpner med «Hei Halvard,» selv om leadet
    // sier «Halvard Langhelle».
    for (const del of navn.split(/\s+/)) {
      if (del.length >= 3) ut = ut.replaceAll(regexFor(del), "[kunde]");
    }
  }

  for (const [verdi, merke] of [
    [kjente.adresse, "[adresse]"],
    [kjente.epost, "[e-post]"],
    [kjente.telefon, "[telefon]"],
  ] as const) {
    const v = (verdi ?? "").trim();
    if (v.length >= 4) ut = ut.replaceAll(regexFor(v), merke);
  }

  return ut;
}

/** Anonymiserer hvert element og kaster tomme. */
export function anonymiserListe(
  verdier: (string | null | undefined)[],
  kjente: KjenteVerdier = {},
): string[] {
  return verdier
    .map((v) => anonymiser(v, kjente).trim())
    .filter((v) => v.length > 0);
}

/** Ordgrense rundt en verdi vi vet, uten at tegn i den blir regex-syntaks. */
function regexFor(verdi: string): RegExp {
  const rensa = verdi.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\wæøåÆØÅ])${rensa}(?![\\wæøåÆØÅ])`, "gi");
}
