import { computeTotals, formatNok, harRabatt, lineDiscount, lineTotal, type QuoteDocument, type QuoteLine } from "@/lib/types";
import { renderQuoteHtml } from "@/lib/pdf/template";

/**
 * Rabatt per rad.
 *
 * Det som må holde: linjesummen er etter rabatt, totalen følger med, og
 * rabattkolonnen finnes i PDF-en bare når minst én rad faktisk har rabatt.
 */

let feil = 0;
function sjekk(navn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${navn.padEnd(50)} ${JSON.stringify(faktisk)}${ok ? "" : ` (venta ${JSON.stringify(venta)})`}`);
}

const linje = (patch: Partial<QuoteLine>): QuoteLine => ({
  price_item_id: null,
  description: "Stikkontakt",
  quantity: 4,
  unit: "stk",
  unit_price: 1000,
  ...patch,
});

const dok = (linjer: QuoteLine[]): QuoteDocument => ({
  customer: { name: "Kunde", contact: null, email: null, phone: null, address: null },
  title: "Test",
  sections: [{ title: "Arbeid", lines: linjer }],
  assumptions: [],
  valid_until: null,
  vat_rate: 25,
});

sjekk("ingen rabatt = full sum", lineTotal(linje({})), 4000);
sjekk("10 % rabatt", lineTotal(linje({ discount_pct: 10 })), 3600);
sjekk("0 % er ingen rabatt", lineDiscount(linje({ discount_pct: 0 })), 0);
sjekk("negativ rabatt ignoreres", lineDiscount(linje({ discount_pct: -5 })), 0);
sjekk("over 100 klemmes til 100", lineTotal(linje({ discount_pct: 150 })), 0);
sjekk("NaN er ingen rabatt", lineDiscount(linje({ discount_pct: Number.NaN })), 0);

const utan = dok([linje({}), linje({})]);
const med = dok([linje({}), linje({ discount_pct: 25 })]);

sjekk("harRabatt utan", harRabatt(utan), false);
sjekk("harRabatt med", harRabatt(med), true);
sjekk("harRabatt med 0 %", harRabatt(dok([linje({ discount_pct: 0 })])), false);
sjekk("total utan rabatt", computeTotals(utan).subtotal, 8000);
sjekk("total med 25 % på ei rad", computeTotals(med).subtotal, 7000);
sjekk("mva følgjer rabatten", computeTotals(med).vat, 1750);

const html = (d: QuoteDocument) =>
  renderQuoteHtml({ document: d, quoteType: "punktpris", brand: {}, companyName: "Firma" });

sjekk("PDF utan rabatt: ingen kolonne", /<th class="num">Rabatt<\/th>/.test(html(utan)), false);
sjekk("PDF med rabatt: kolonne", /<th class="num">Rabatt<\/th>/.test(html(med)), true);
sjekk("PDF med rabatt: 25 % på rada", html(med).includes(">25 %</td>"), true);
sjekk("PDF med rabatt: tomt på rad utan", html(med).includes('<td class="num rabatt"></td>'), true);
sjekk("PDF: beløp etter rabatt", html(med).includes(formatNok(3000)), true);

// Fleire seksjonar: colspan må følgje kolonnetalet, elles skeivar tabellen.
const to = { ...med, sections: [...med.sections, { title: "Materiell", lines: [linje({})] }] };
sjekk("colspan 6 med rabatt", html(to).includes('colspan="6"'), true);
sjekk("colspan 5 utan rabatt", html({ ...utan, sections: to.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, discount_pct: undefined })) })) }).includes('colspan="5"'), true);

if (feil > 0) {
  console.log(`\n${feil} feil.`);
  process.exit(1);
}
console.log("\nAlle testar passerte.");
