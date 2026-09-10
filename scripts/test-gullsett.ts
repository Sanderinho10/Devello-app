/**
 * Prøve på målingen bak gullsettet — uten database.
 *
 *   npm run test:gullsett
 *
 * De to sakene speiler formen på de første pilottilbudene: én der brukeren
 * tok ut to poster og rettet en pakkepris, og én der alle postene sto, men
 * tre beløp ble satt på nytt fordi prisfilen manglet dem. Poenget med prøven
 * er at målingen skiller de to: første saken er «fjernet + prisoverstyrt»,
 * andre er «bare prisoverstyrt» — ingen av dem er «manglet», og
 * omfangsavviket skal være null i begge.
 */
import { maal, type Snapshot } from "@/lib/evaluering/maaling";
import type { QuoteDocument, QuoteLine } from "@/lib/types";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

function linje(id: string | null, description: string, unit_price: number, quantity = 1): QuoteLine {
  return { price_item_id: id, description, quantity, unit: "stk", unit_price };
}

function dok(lines: QuoteLine[], assumptions: string[] = []): QuoteDocument {
  return {
    customer: { name: "Kunde", contact: null, email: null, phone: null, address: null },
    title: "Tilbud",
    sections: [{ title: "Arbeid", lines }],
    assumptions,
    valid_until: "2026-10-10",
    vat_rate: 25,
  };
}

const snap = (document: QuoteDocument): Snapshot => ({
  quote_type: "punktpris",
  email_subject: "Tilbud",
  email_body: "",
  document,
});

// Sak A: pakke + to dokumentasjonslinjer + to diverse-linjer. Brukeren tok ut
// diverse-linjene og satte pakkeprisen ned. Ingen post manglet.
const a = maal(
  "a",
  "Sak A",
  null,
  true,
  snap(
    dok(
      [
        linje("pakke", "Pakkepris elbillader", 12452.54),
        linje("dok", "Dokumentasjon", 0),
        linje("sams", "Samsvarserklæring", 0),
        linje("div", "Arbeidstimer", 0),
        linje("div", "Servicebil", 0),
      ],
      ["Antatt inntil 10 m", "Oppmøtekost kommer i tillegg"],
    ),
  ),
  snap(
    dok(
      [
        linje("pakke", "Pakkepris elbillader", 11160),
        linje("dok", "Dokumentasjon", 0),
        linje("sams", "Samsvarserklæring", 0),
      ],
      ["Antatt inntil 10 m"],
    ),
  ),
);

sjekk("A: dekning 100 %", a.dekning === 1, `${a.dekning}`);
sjekk("A: ingen post manglet", a.manglet.length === 0, a.manglet.join(", "));
sjekk("A: to poster fjernet", a.fjernet.length === 2, `${a.fjernet.length}`);
sjekk("A: én prisoverstyring", a.prisoverstyrt.length === 1 && a.prisoverstyrt[0].til === 11160);
sjekk("A: rått avvik ≈ +12 %", a.avvikPct !== null && Math.abs(a.avvikPct - 0.1158) < 0.005, `${a.avvikPct}`);
sjekk("A: omfangsavvik 0", a.omfangsavvikPct !== null && Math.abs(a.omfangsavvikPct) < 1e-9, `${a.omfangsavvikPct}`);
sjekk("A: én forutsetning fjernet", a.forutsetningerFjernet === 1 && a.forutsetningerLagtTil === 0);

// Sak B: samme fem poster før og etter, men tre av dem fikk beløp de ikke
// hadde i prisfilen. Rått avvik er stort; omfangsavviket er null.
const b = maal(
  "b",
  "Sak B",
  null,
  false,
  snap(
    dok([
      linje("pakke2", "Pakkepris installasjon, lader levert av kunde", 4532.84),
      linje("dok", "Dokumentasjon", 0),
      linje("sams", "Samsvarserklæring", 0),
      linje("div", "Arbeidstimer", 0),
      linje("div", "Servicebil", 0),
    ]),
  ),
  snap(
    dok([
      linje("pakke2", "Pakkepris installasjon, lader levert av kunde", 7000),
      linje("dok", "Dokumentasjon", 0),
      linje("sams", "Samsvarserklæring", 0),
      linje("div", "Arbeidstimer", 1200),
      linje("div", "Servicebil", 560),
    ]),
  ),
);

sjekk("B: dekning 100 %", b.dekning === 1);
sjekk("B: ingen manglet, ingen fjernet", b.manglet.length === 0 && b.fjernet.length === 0);
sjekk("B: tre prisoverstyringer", b.prisoverstyrt.length === 3, `${b.prisoverstyrt.length}`);
sjekk("B: rått avvik ≈ −48 %", b.avvikPct !== null && Math.abs(b.avvikPct + 0.4826) < 0.005, `${b.avvikPct}`);
sjekk("B: omfangsavvik 0", b.omfangsavvikPct !== null && Math.abs(b.omfangsavvikPct) < 1e-9, `${b.omfangsavvikPct}`);

// Sak C: agenten manglet en post og hadde feil mengde på en annen. Dette er
// omfangsfeil, og de skal synes i omfangsavviket selv om prisene stemmer.
const c = maal(
  "c",
  "Sak C",
  null,
  true,
  snap(dok([linje("stikk", "Punkt for stikkontakt", 775.26, 6), linje("dok", "Dokumentasjon", 0)])),
  snap(
    dok([
      linje("stikk", "Punkt for stikkontakt", 775.26, 10),
      linje("kurs", "Ny kurs fra sikringsskap", 2450, 1),
      linje("dok", "Dokumentasjon", 0),
    ]),
  ),
);

sjekk("C: én post manglet", c.manglet.length === 1 && c.manglet[0].startsWith("Ny kurs"), c.manglet.join(", "));
sjekk("C: dekning 2 av 3", Math.abs(c.dekning - 2 / 3) < 1e-9, `${c.dekning}`);
sjekk("C: omfangsavvik negativt (for lite omfang)", c.omfangsavvikPct !== null && c.omfangsavvikPct < -0.4, `${c.omfangsavvikPct}`);

// Poster uten prisrad matches på tekst — ikke på beløp.
const d = maal(
  "d",
  "Sak D",
  null,
  true,
  snap(dok([linje(null, "Manuelt priset post", 1000)])),
  snap(dok([linje(null, "Manuelt priset post", 1500)])),
);
sjekk("D: post uten prisrad matches på tekst", d.dekning === 1 && d.prisoverstyrt.length === 1);

console.log(feil === 0 ? "\nAlt grønt." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
