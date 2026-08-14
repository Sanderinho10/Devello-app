/**
 * Genererer ein eksempel-PDF frå malen, utan database eller Microsoft-tilkopling.
 * Nyttig når ein jobbar med sjølve designet på tilbodet.
 *
 *   npm run preview:pdf            # punktpris
 *   npm run preview:pdf -- fastpris
 *
 * Resultatet hamnar i tmp/eksempel-tilbod.pdf.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { closePdfRenderer, htmlToPdf } from "@/lib/pdf/render";
import { renderQuoteHtml } from "@/lib/pdf/template";
import type { QuoteDocument, QuoteType } from "@/lib/types";

const quoteType = (process.argv[2] as QuoteType) || "punktpris";

const punktpris: QuoteDocument = {
  customer: {
    name: "Marit Aasen",
    contact: null,
    email: "marit.aasen@gmail.com",
    phone: "412 33 907",
    address: "Bjørkevegen 22, 6800 Førde",
  },
  title: "Elektrisk arbeid — kjellarstove",
  intro:
    "Takk for førespurnaden om elektrisk arbeid i den nye kjellarstova. Under finn du eit tilbod der kvar post er ein samla pris som dekker både arbeid og materiell.",
  sections: [
    {
      title: "Postar",
      lines: [
        {
          price_item_id: null,
          description: "Montering stikkontakt, dobbel",
          quantity: 8,
          unit: "stk",
          unit_price: 890,
        },
        {
          price_item_id: null,
          description: "Kursopplegg frå sikringsskap",
          quantity: 2,
          unit: "stk",
          unit_price: 2450,
        },
        {
          price_item_id: null,
          description: "Montering takpunkt med brytar",
          quantity: 3,
          unit: "stk",
          unit_price: 1340,
        },
      ],
    },
  ],
  assumptions: [
    "Prisen føreset framkome til sikringsskap og at veggar er opne ved montering.",
    "Uføresett arbeid utover dette blir avtalt før det blir utført.",
    "Tilbodet gjeld i 30 dagar frå dato.",
  ],
  valid_until: "2026-09-13",
  vat_rate: 25,
};

const fastpris: QuoteDocument = {
  ...punktpris,
  title: "Oppgradering av sikringsskap",
  intro:
    "Takk for førespurnaden om oppgradering av sikringsskapet. Tilbodet under er spesifisert med materiell og timar kvar for seg, slik at det går fram kva som kjem i tillegg dersom jobben krev meir enn det som er lagt inn.",
  sections: [
    {
      title: "Materiell",
      lines: [
        {
          price_item_id: null,
          description: "Sikringsskap 24 modular",
          quantity: 1,
          unit: "stk",
          unit_price: 4200,
        },
        {
          price_item_id: null,
          description: "Jordfeilautomat 16 A",
          quantity: 9,
          unit: "stk",
          unit_price: 640,
        },
      ],
    },
    {
      title: "Arbeid",
      lines: [
        {
          price_item_id: null,
          description: "Montering og terminering",
          quantity: 7,
          unit: "time",
          unit_price: 1190,
        },
        {
          price_item_id: null,
          description: "Sluttkontroll og dokumentasjon",
          quantity: 1.5,
          unit: "time",
          unit_price: 1190,
        },
      ],
    },
  ],
  assumptions: [
    "Prisen byggjer på 8,5 timar arbeid. Timar utover dette blir fakturert med 1 190 kr eks. mva. per time.",
    "Materiellet over dekker eit skap med 24 modular. Krev anlegget fleire kursar, kjem materiellet for desse i tillegg.",
    "Eventuell utbetring av eksisterande kablar er ikkje med i tilbodet.",
  ],
};

const document = quoteType === "fastpris" ? fastpris : punktpris;

const html = renderQuoteHtml({
  document,
  quoteType,
  companyName: "Star Elektro AS",
  brand: {
    primary_color: "#0a5c3a",
    contact_email: "post@starelektro.no",
    contact_phone: "57 82 10 40",
    address_line: "Storgata 14",
    postal_code: "6800",
    city: "Førde",
    website: "starelektro.no",
    footer_note: "Org.nr 912 345 678 MVA · Alle prisar er oppgitt eks. mva.",
  },
});

const pdf = await htmlToPdf(html);
await mkdir("tmp", { recursive: true });
await writeFile("tmp/eksempel-tilbod.pdf", pdf);
await closePdfRenderer();

console.log(
  `Skreiv tmp/eksempel-tilbod.pdf (${quoteType}, ${Math.round(pdf.byteLength / 1024)} kB)`,
);
