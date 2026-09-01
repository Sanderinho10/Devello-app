/**
 * Opplæringsprosenten.
 *
 *   npm run test:opplaering
 *
 * Modellen har to lag: grunnlag (inntil 40) for det som er lastet opp, og
 * utfall (inntil 60) for hvordan de siste tilbudene faktisk gikk. Det testene
 * vokter er fordelingen: opplasting alene skal ALDRI kunne gi et høyt tall.
 * En prosent som når 100 uten at et eneste tilbud er målt, er markedsføring.
 */
import { regnOpplaering, type OpplaeringsTal } from "@/lib/opplaering/status";

let feil = 0;
function sjekk(namn: string, faktisk: number | string | boolean, venta: number | string | boolean) {
  const ok = faktisk === venta;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(58)} ${faktisk}${ok ? "" : `  (venta ${venta})`}`);
}

function tal(over: Partial<OpplaeringsTal>): OpplaeringsTal {
  return {
    prisrader: 0,
    lesteReferansefiler: 0,
    bekreftaTilbod: 0,
    ulikeTags: 0,
    forbehold: 0,
    sisteUroerte: [],
    sisteFullDekning: [],
    sisteMedTreff: [],
    ...over,
  };
}

/** n tilbud der andelen ok er som oppgitt. */
function serie(n: number, ok: number): boolean[] {
  return Array.from({ length: n }, (_, i) => i < ok);
}

console.log("— portene —");
sjekk("helt tomt gir 0 %", regnOpplaering(tal({})).prosent, 0);
sjekk("helt tomt sier hva som mangler", regnOpplaering(tal({})).merkelapp, "Mangler prisfil");
sjekk(
  "perfekte utfall uten prisfil gir likevel 0 %",
  regnOpplaering(
    tal({ sisteUroerte: serie(10, 10), sisteFullDekning: serie(10, 10), sisteMedTreff: serie(10, 10) }),
  ).prosent,
  0,
);

console.log("\n— opplasting alene kan ikke kjøpe et høyt tall —");
const fulltLager = tal({
  prisrader: 500,
  lesteReferansefiler: 100,
  bekreftaTilbod: 0,
  ulikeTags: 100,
  forbehold: 50,
});
const lagerScore = regnOpplaering(fulltLager).prosent;
console.log(`     absurd mye opplastet, null tilbud sendt:        ${lagerScore} %`);
sjekk("…og det stopper under 40", lagerScore <= 40, true);
sjekk("…med en merkelapp som sier at ingenting er målt",
  regnOpplaering(fulltLager).merkelapp, "Grunnlag på plass — ikke målt ennå");

console.log("\n— uleste filer teller ikke —");
// Fjorten opplastede PDF-er uten uthentet tekst er usynlige for genereringen.
// De skal ikke gi grunnlagspoeng: opplaeringFor teller bare filer med tekst,
// saa de kommer inn her som 0.
const uleste = regnOpplaering(tal({ prisrader: 234, lesteReferansefiler: 0 }));
sjekk("14 uleste filer (= 0 leste) gir 0 %", uleste.prosent, 0);
sjekk("…og de samme filene lest gir mer",
  regnOpplaering(tal({ prisrader: 234, lesteReferansefiler: 14, ulikeTags: 20, forbehold: 8 })).prosent > 20, true);

console.log("\n— prisoverstyring teller ikke som retting —");
// I opplaeringFor blir «edited_by_user uten edit_summary» til uroert=true.
// Her testes selve regnestykket: to like serier skal gi samme tall.
const a = regnOpplaering(tal({ prisrader: 100, sisteUroerte: [true, true, true, true] }));
const b = regnOpplaering(tal({ prisrader: 100, sisteUroerte: serie(4, 4) }));
sjekk("samme serie gir samme tall", a.prosent, b.prosent);

console.log("\n— kurven, dokumentert —");
const stadium: [string, OpplaeringsTal][] = [
  ["ny kunde: prisfil + 3 filer", tal({ prisrader: 234, lesteReferansefiler: 3, ulikeTags: 9, forbehold: 2 })],
  [
    "3 tilbud sendt, 2 urørt",
    tal({
      prisrader: 234, lesteReferansefiler: 3, bekreftaTilbod: 3, ulikeTags: 12, forbehold: 4,
      sisteUroerte: serie(3, 2), sisteFullDekning: serie(6, 5), sisteMedTreff: serie(6, 3),
    }),
  ],
  [
    "10 tilbud, 7 urørt, god dekning",
    tal({
      prisrader: 234, lesteReferansefiler: 6, bekreftaTilbod: 10, ulikeTags: 16, forbehold: 6,
      sisteUroerte: serie(10, 7), sisteFullDekning: serie(10, 9), sisteMedTreff: serie(10, 8),
    }),
  ],
  [
    "innkjørt: 10 av 10 urørt, alt dekket",
    tal({
      prisrader: 234, lesteReferansefiler: 10, bekreftaTilbod: 40, ulikeTags: 25, forbehold: 10,
      sisteUroerte: serie(10, 10), sisteFullDekning: serie(10, 10), sisteMedTreff: serie(10, 10),
    }),
  ],
  [
    "innkjørt, men rettes fortsatt ofte",
    tal({
      prisrader: 234, lesteReferansefiler: 10, bekreftaTilbod: 40, ulikeTags: 25, forbehold: 10,
      sisteUroerte: serie(10, 4), sisteFullDekning: serie(10, 10), sisteMedTreff: serie(10, 10),
    }),
  ],
];
for (const [namn, t] of stadium) {
  const r = regnOpplaering(t);
  console.log(`     ${namn.padEnd(44)} ${String(r.prosent).padStart(3)} %  ${r.merkelapp}`);
}

console.log("\n— egenskapene —");
const innkjoert = regnOpplaering(stadium[3][1]);
sjekk("selv plettfri drift når ikke 100", innkjoert.prosent < 100, true);
sjekk("men den når over 80", innkjoert.prosent > 80, true);

const rettes = regnOpplaering(stadium[4][1]);
sjekk("rettinger koster, samme lager", innkjoert.prosent - rettes.prosent >= 12, true);

// Få målinger gir få poeng, selv når alle er plettfrie.
const faa = regnOpplaering(tal({ prisrader: 234, sisteUroerte: serie(2, 2), sisteFullDekning: serie(2, 2), sisteMedTreff: serie(2, 2) }));
const mange = regnOpplaering(tal({ prisrader: 234, sisteUroerte: serie(10, 10), sisteFullDekning: serie(10, 10), sisteMedTreff: serie(10, 10) }));
sjekk("2 plettfrie beviser mindre enn 10 plettfrie", faa.prosent < mange.prosent, true);

sjekk("aldri over 100",
  regnOpplaering(tal({ prisrader: 9999, lesteReferansefiler: 999, bekreftaTilbod: 999, ulikeTags: 999, forbehold: 999,
    sisteUroerte: serie(10, 10), sisteFullDekning: serie(10, 10), sisteMedTreff: serie(10, 10) })).prosent <= 100, true);
sjekk("aldri under 0", regnOpplaering(tal({ prisrader: -3, lesteReferansefiler: -3 })).prosent >= 0, true);

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
