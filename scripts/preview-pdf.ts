/**
 * Genererer en eksempel-PDF fra malen, uten database eller Microsoft-tilkobling.
 * Nyttig når man jobber med selve designet på tilbudet.
 *
 *   npm run preview:pdf            # punktpris
 *   npm run preview:pdf -- fastpris
 *
 * Resultatet havner i tmp/eksempel-tilbud.pdf.
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
    address: "Bjørkeveien 22, 6800 Førde",
  },
  title: "Elektrisk arbeid — kjellerstue",
  sections: [
    {
      title: "Poster",
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
          description: "Kursopplegg fra sikringsskap",
          quantity: 2,
          unit: "stk",
          unit_price: 2450,
        },
        {
          price_item_id: null,
          description: "Montering takpunkt med bryter",
          quantity: 3,
          unit: "stk",
          unit_price: 1340,
        },
      ],
    },
  ],
  assumptions: [
    "Prisen forutsetter framkomst til sikringsskap og at vegger er åpne ved montering.",
    "Uforutsett arbeid utover dette blir avtalt før det blir utført.",
    "Tilbudet gjelder i 30 dager fra dato.",
  ],
  valid_until: "2026-09-13",
  vat_rate: 25,
};

const fastpris: QuoteDocument = {
  ...punktpris,
  title: "Oppgradering av sikringsskap",
  sections: [
    {
      title: "Materiell",
      lines: [
        {
          price_item_id: null,
          description: "Sikringsskap 24 moduler",
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
    "Prisen bygger på 8,5 timer arbeid. Timer utover dette blir fakturert med 1 190 kr eks. mva. per time.",
    "Materiellet over dekker et skap med 24 moduler. Krever anlegget flere kurser, kommer materiellet for disse i tillegg.",
    "Eventuell utbedring av eksisterende kabler er ikke med i tilbudet.",
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
    website: "starelektro.no",
    footer_note: "Org.nr 912 345 678 MVA · Alle priser er oppgitt eks. mva.",
  },
  address: { line: "Storgata 14", postalCode: "6800", city: "Førde" },
});

const pdf = await htmlToPdf(html);
await mkdir("tmp", { recursive: true });
await writeFile("tmp/eksempel-tilbud.pdf", pdf);
await closePdfRenderer();

console.log(
  `Skrev tmp/eksempel-tilbud.pdf (${quoteType}, ${Math.round(pdf.byteLength / 1024)} kB)`,
);
