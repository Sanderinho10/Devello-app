/**
 * Prøve på NELFO 4.0-parseren — uten fil, uten database.
 *
 *   npm run test:nelfo4
 *
 * Fixturen er en liten varefil bygget for hånd: en header, tre varelinjer
 * (stykkvare, kabel priset per 100 m, en utgått vare), en alternativpost med
 * GTIN, en tilleggspost som skal hoppes over, og en pristilbudslinje med
 * nettopris. Bytesene er Windows-1252 med vilje — «ø» er én byte (0xF8), og
 * det er akkurat det som går galt om noen dekoder fila som UTF-8.
 */
import { parseNelfo4, parseNelfo4Tekst, parseRabattfilTekst } from "@/lib/grossist/nelfo4";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const linjer = [
  "VH;EFONELFO;4.0;987654321;;123456;20260901;;NOK;;Onninen AS;Postboks 1;0101;Oslo;;NO",
  // Stykkvare: 20,50 kr per stk.
  "VL;1;1234567;Stikkontakt dobbel;innfelt;1;EA;stk;2050;10000;20260901;1;B01;R10;ELKO;Plus;J;100000;;",
  "VX;DIMENSJON;80x80",
  "VA;2;7020160123456;V;",
  // Kabel: 3 850,00 kr per 100 m (HMT) → 38,50 per meter.
  "VL;1;1001234;Kabel PFXP 3G2,5;;2;HMT;100 m;385000;1000000;20260901;2;B02;R20;Nexans;;J;;;",
  // Utgått vare med ø i navnet.
  "VL;1;2002345;Kabelrør 20 mm;;2;MTR;m;850;10000;20260901;3;B03;R20;;;N;;;",
];
const pl = "PL;1;3003456;Jordfeilautomat 16A;;1;EA;stk;64000;10000;20260901;1;;R30;ABB;;J;;0;N";
const plBrutto = "PL;1;3003457;Automat 10A;;1;EA;stk;10000;10000;20260901;1;;R30;ABB;;J;;2500;B";

// Windows-1252-bytes: alt ASCII unntatt ø (0xF8) og ø i «Kabelrør».
function win1252(tekst: string): Uint8Array {
  const ut = new Uint8Array(tekst.length);
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst.charCodeAt(i);
    if (c === 0xf8) ut[i] = 0xf8;
    else if (c < 128) ut[i] = c;
    else throw new Error(`Fixturen har et tegn utenfor ASCII/ø: ${tekst[i]}`);
  }
  return ut;
}

const varefil = await parseNelfo4(win1252(linjer.join("\r\n") + "\r\n"), "V4test.txt");

// Header ----------------------------------------------------------------------
sjekk("header: format og versjon", varefil.header.format === "EFONELFO" && varefil.header.versjon === "4.0");
sjekk("header: selger, kundenummer, dato", varefil.header.sellerId === "987654321" && varefil.header.customerNo === "123456" && varefil.header.fromDate === "2026-09-01");
sjekk("header: firmanavn", varefil.header.sellerName === "Onninen AS");

// Linjer ----------------------------------------------------------------------
sjekk("tre varelinjer, VX og VA er ikke linjer", varefil.lines.length === 3, `fikk ${varefil.lines.length}`);

const stikk = varefil.lines.find((l) => l.itemNo === "1234567");
sjekk("stykkvare: pris 20,50 per stk", stikk?.listPrice === 20.5 && stikk?.listPricePerUnit === 20.5 && stikk?.unit === "stk");
sjekk("stykkvare: navn er VaBetg + VaBetg2", stikk?.name === "Stikkontakt dobbel innfelt", stikk?.name);
sjekk("stykkvare: GTIN fra VA-posten", stikk?.gtin === "7020160123456", stikk?.gtin);
sjekk("stykkvare: rabattgruppe, fabrikat, lagerført, salgspakning", stikk?.discountGroup === "R10" && stikk?.brand === "ELKO" && stikk?.stocked === true && stikk?.salesPack === 10);
sjekk("stykkvare: ingen rabatt i en varefil", stikk?.discountPct === undefined && stikk?.netPricePerUnit === undefined);

const kabel = varefil.lines.find((l) => l.itemNo === "1001234");
sjekk("kabel: 100 m per prisenhet (HMT)", kabel?.qtyPerPriceUnit === 100 && kabel?.priceUnit === "HMT");
sjekk("kabel: 3 850 per prisenhet blir 38,50 per meter", kabel?.listPrice === 3850 && kabel?.listPricePerUnit === 38.5, `${kabel?.listPricePerUnit}`);
sjekk("kabel: enhet meter", kabel?.unit === "m");

const roer = varefil.lines.find((l) => l.itemNo === "2002345");
sjekk("utgått vare har status 3", roer?.status === 3);
sjekk("«ø» er dekodet som Windows-1252", roer?.name === "Kabelrør 20 mm", roer?.name);
sjekk("lagerført N → false", roer?.stocked === false);

sjekk("ingen advarsler på en ren fil", varefil.warnings.length === 0, varefil.warnings.join(" | "));

// Pristilbud (PL) ------------------------------------------------------------
const pris = parseNelfo4Tekst(["PH;EFONELFO;4.0;987654321;;123456;20260901;;NOK;;Onninen AS", pl, plBrutto].join("\r\n"));
const netto = pris.lines.find((l) => l.itemNo === "3003456");
sjekk("PL netto: pris i feltet er nettopris", netto?.priceType === "N" && netto?.discountPct === 0 && netto?.netPricePerUnit === 640);
const brutto = pris.lines.find((l) => l.itemNo === "3003457");
sjekk("PL brutto med 25 % rabatt: netto = 100 × 0,75", brutto?.priceType === "B" && brutto?.discountPct === 25 && brutto?.netPricePerUnit === 75, `${brutto?.netPricePerUnit}`);

// Feil format -----------------------------------------------------------------
try {
  parseNelfo4Tekst("Elnr;Navn;Pris\r\n1234567;Stikkontakt;20,50\r\n");
  sjekk("ukjent format kaster", false);
} catch (err) {
  const melding = err instanceof Error ? err.message : String(err);
  sjekk("ukjent format kaster med de første linjene sitert", melding.includes("Elnr;Navn;Pris"));
}

// Rabattfil -------------------------------------------------------------------
const rabatt = parseRabattfilTekst("RH;EFONELFO;4.0\r\nR10;2500\r\nR20;35,5\r\nRL;R30;1000\r\n");
sjekk("rabattfil: to implisitte desimaler", rabatt.get("R10") === 25);
sjekk("rabattfil: desimalkomma", rabatt.get("R20") === 35.5);
sjekk("rabattfil: linje med posttype først", rabatt.get("R30") === 10);
try {
  parseRabattfilTekst("Dette er ikke en rabattfil\r\nBare tekst\r\nOg mer tekst\r\n");
  sjekk("ukjent rabattfil kaster", false);
} catch (err) {
  sjekk("ukjent rabattfil kaster med linjene sitert", String((err as Error).message).includes("Bare tekst"));
}

// Zip -------------------------------------------------------------------------
const JSZip = (await import("jszip")).default;
const zip = new JSZip();
zip.file("V4varefil.txt", win1252(linjer.join("\r\n")));
const zipBytes = await zip.generateAsync({ type: "uint8array" });
const fraZip = await parseNelfo4(zipBytes, "V4varefil.zip");
sjekk("zip: tekstfila inni blir lest", fraZip.lines.length === 3 && fraZip.lines[2].name === "Kabelrør 20 mm");

console.log(feil === 0 ? "\nAlt i orden." : `\n${feil} feil.`);
process.exit(feil === 0 ? 0 : 1);
