/**
 * Opplæringsprosenten.
 *
 *   npm run test:opplaering
 *
 * Det som testes er at kurven er pessimistisk. En prosent som sier 100 mens
 * tilbudene fortsatt må rettes hver gang er verre enn ingen prosent — den
 * flytter skylden fra datagrunnlaget til agenten, og da slutter folk å mate
 * den.
 */
import { regnOpplaering } from "@/lib/opplaering/status";

let feil = 0;
function sjekk(namn: string, faktisk: number | string | boolean, venta: number | string | boolean) {
  const ok = faktisk === venta;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(56)} ${faktisk}${ok ? "" : `  (venta ${venta})`}`);
}

const tomt = { prisrader: 0, referansefiler: 0, bekreftaTilbod: 0, rettaTilbod: 0, ulikeTags: 0 };
sjekk("helt tomt gir 0 %", regnOpplaering(tomt).prosent, 0);
sjekk("helt tomt sier hva som mangler", regnOpplaering(tomt).merkelapp, "Mangler prisfil");

// Porten: prisfila er ein føresetnad, ikkje eit ledd.
sjekk(
  "alt annet på plass, men ingen prisfil, gir 0 %",
  regnOpplaering({ ...tomt, referansefiler: 20, bekreftaTilbod: 80, rettaTilbod: 20, ulikeTags: 40 }).prosent,
  0,
);

const medPris = { ...tomt, prisrader: 234 };
sjekk("prisfil alene gir 0 %", regnOpplaering(medPris).prosent, 0);

// Realistiske stadium. Tala her er dokumentasjon: slik ser kurven ut.
const stadium = [
  ["prisfil + 1 referansefil", { ...medPris, referansefiler: 1, ulikeTags: 4 }],
  ["prisfil + 3 filer, 2 tilbud", { ...medPris, referansefiler: 3, bekreftaTilbod: 2, ulikeTags: 8 }],
  ["8 filer, 10 tilbud, 3 retta", { ...medPris, referansefiler: 8, bekreftaTilbod: 10, rettaTilbod: 3, ulikeTags: 14 }],
  ["8 filer, 25 tilbud, 8 retta (alle mål)", { ...medPris, referansefiler: 8, bekreftaTilbod: 25, rettaTilbod: 8, ulikeTags: 20 }],
  ["20 filer, 80 tilbud, 30 retta", { ...medPris, referansefiler: 20, bekreftaTilbod: 80, rettaTilbod: 30, ulikeTags: 45 }],
] as const;

console.log("");
for (const [namn, t] of stadium) {
  const r = regnOpplaering(t);
  console.log(`     ${namn.padEnd(42)} ${String(r.prosent).padStart(3)} %  ${r.merkelapp}`);
}

console.log("");
const paaMaal = regnOpplaering({ ...medPris, referansefiler: 8, bekreftaTilbod: 25, rettaTilbod: 8, ulikeTags: 20 });
sjekk("på målet er man IKKE i nærheten av 100", paaMaal.prosent < 80, true);
sjekk("på målet er man over halvveis", paaMaal.prosent > 50, true);

const mykje = regnOpplaering({ ...medPris, referansefiler: 20, bekreftaTilbod: 80, rettaTilbod: 30, ulikeTags: 45 });
sjekk("mye data nærmer seg, men treffer ikke 100", mykje.prosent < 100, true);
sjekk("mye data gir over 85", mykje.prosent > 85, true);

// Monotoni: meir data skal aldri gi lågare tal.
let forrige = -1;
let brot = 0;
for (let n = 0; n <= 120; n++) {
  const p = regnOpplaering({ ...medPris, referansefiler: Math.min(n, 30), bekreftaTilbod: n, rettaTilbod: Math.floor(n / 3), ulikeTags: Math.min(n, 50) }).prosent;
  if (p < forrige) brot++;
  forrige = p;
}
sjekk("flere tilbud gir aldri lavere prosent (121 steg)", brot, 0);

// Alltid innanfor 0–100.
sjekk("aldri over 100", regnOpplaering({ prisrader: 5000, referansefiler: 500, bekreftaTilbod: 5000, rettaTilbod: 5000, ulikeTags: 500 }).prosent <= 100, true);
sjekk("aldri under 0", regnOpplaering({ prisrader: -1, referansefiler: -5, bekreftaTilbod: -5, rettaTilbod: -5, ulikeTags: -5 }).prosent >= 0, true);

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
