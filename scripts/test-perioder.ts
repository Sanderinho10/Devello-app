/**
 * Periodemattematikken for abonnementene.
 *
 *   npm run test:perioder
 *
 * Krever ingen database og ingen nøkler. Dette er regnestykket som avgjør
 * hvilken måned et tilbud telles i, og en feil her koster enten kunden eller
 * oss penger uten å si fra — derfor står den her og ikke bare i hodet.
 */
import {
  finnBedrePakke,
  gjeldandePeriode,
  leggTilMaanader,
  periodekostnad,
} from "@/lib/billing/subscription";
import { AGENT_PLANS, findAgentPlan } from "@/lib/billing/agents";

const iso = (d: Date) => d.toISOString().slice(0, 10);
let feil = 0;
function sjekk(namn: string, faktisk: string, venta: string) {
  const ok = faktisk === venta;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(46)} ${faktisk}${ok ? "" : `   (venta ${venta})`}`);
}

// Klemming: 31. januar + 1 månad
sjekk("31.01 + 1 mnd (ikkje-skotår)", iso(leggTilMaanader(new Date("2026-01-31T10:00:00Z"), 1)), "2026-02-28");
sjekk("31.01 + 1 mnd (skotår)",       iso(leggTilMaanader(new Date("2028-01-31T10:00:00Z"), 1)), "2028-02-29");
sjekk("31.01 + 2 mnd (tilbake til 31)", iso(leggTilMaanader(new Date("2026-01-31T10:00:00Z"), 2)), "2026-03-31");
sjekk("30.11 + 1 mnd (årsskifte)",    iso(leggTilMaanader(new Date("2026-11-30T10:00:00Z"), 1)), "2026-12-30");
sjekk("15.12 + 1 mnd (årsskifte)",    iso(leggTilMaanader(new Date("2026-12-15T10:00:00Z"), 1)), "2027-01-15");

// Perioder
const a = "2026-08-16T23:00:35Z";
let p = gjeldandePeriode(a, new Date("2026-08-20T12:00:00Z"));
sjekk("anker 16.08, no 20.08 -> start", iso(p.start), "2026-08-16");
sjekk("anker 16.08, no 20.08 -> slutt", iso(p.slutt), "2026-09-16");
sjekk("anker 16.08, no 20.08 -> nr", String(p.nummer), "0");

p = gjeldandePeriode(a, new Date("2026-09-03T12:00:00Z"));
sjekk("no 03.09 (før dagen i mnd) -> start", iso(p.start), "2026-08-16");
sjekk("no 03.09 -> nr", String(p.nummer), "0");

p = gjeldandePeriode(a, new Date("2026-09-16T23:30:00Z"));
sjekk("no 16.09 rett etter skiftet -> start", iso(p.start), "2026-09-16");
sjekk("no 16.09 rett etter skiftet -> nr", String(p.nummer), "1");

p = gjeldandePeriode(a, new Date("2027-02-01T12:00:00Z"));
sjekk("no 01.02 året etter -> start", iso(p.start), "2027-01-16");
sjekk("no 01.02 året etter -> nr", String(p.nummer), "5");

// Anker på den 31.
p = gjeldandePeriode("2026-01-31T10:00:00Z", new Date("2026-03-01T12:00:00Z"));
sjekk("anker 31.01, no 01.03 -> start", iso(p.start), "2026-02-28");
sjekk("anker 31.01, no 01.03 -> slutt", iso(p.slutt), "2026-03-31");

// Framtidig anker (skal ikkje gi negativ periode)
p = gjeldandePeriode("2027-01-01T00:00:00Z", new Date("2026-08-20T12:00:00Z"));
sjekk("anker i framtida -> nr", String(p.nummer), "0");

// Ingen hol: slutten på periode n er starten på n+1
let hol = 0;
for (let i = 0; i < 40; i++) {
  const no = new Date(Date.UTC(2026, 7, 16, 23, 0, 36) + i * 27 * 864e5);
  const q = gjeldandePeriode(a, no);
  if (!(q.start <= no && no < q.slutt)) hol++;
}
sjekk("no ligg alltid i si eiga periode (40 stikkprøver)", String(hol), "0");

// ---------------------------------------------------------------------------
// Prising
// ---------------------------------------------------------------------------
console.log("");

const liten = findAgentPlan("tilbud_liten")!;
const medium = findAgentPlan("tilbud_medium")!;
const stor = findAgentPlan("tilbud_stor")!;

sjekk("Liten, 30 tilbud (på taket)", String(periodekostnad(liten, 30)), "950");
sjekk("Liten, 0 tilbud", String(periodekostnad(liten, 0)), "950");
sjekk("Liten, 35 tilbud (5 over)", String(periodekostnad(liten, 35)), String(950 + 5 * 39));
sjekk("Medium, 100 tilbud (25 over)", String(periodekostnad(medium, 100)), String(1990 + 25 * 39));

// Overforbrukssatsen skal alltid ligge over enhetsprisen i pakken — ellers
// lønner det seg å bli stående og sprenge taket, og pakkene betyr ingenting.
for (const p of AGENT_PLANS) {
  sjekk(
    `${p.id}: 39 kr > ${Math.round(p.priceNok / p.quota)} kr per enhet`,
    String(p.overageNok > p.priceNok / p.quota),
    "true",
  );
}

// Oppgraderingshintet
const paaLiten = { agentId: "tilbud", planId: "tilbud_liten", priceNok: 950, quota: 30, overageNok: 39 };
sjekk("Liten + 30 brukt: ingen bedre pakke", String(finnBedrePakke(paaLiten, 30)), "null");
// 60 brukt på Liten = 950 + 30×39 = 2120. Medium = 1990. Stor = 3490.
sjekk("Liten + 60 brukt: bytt til Medium", finnBedrePakke(paaLiten, 60)?.plan.id ?? "null", "tilbud_medium");
sjekk("Liten + 60 brukt: sparer", String(finnBedrePakke(paaLiten, 60)?.sparerKr), "130");

const paaMedium = { agentId: "tilbud", planId: "tilbud_medium", priceNok: 1990, quota: 75, overageNok: 39 };
// 130 brukt på Medium = 1990 + 55×39 = 4135. Stor = 3490.
sjekk("Medium + 130 brukt: bytt til Stor", finnBedrePakke(paaMedium, 130)?.plan.id ?? "null", "tilbud_stor");
sjekk("Medium + 130 brukt: sparer", String(finnBedrePakke(paaMedium, 130)?.sparerKr), "645");
// Stor har ingen større pakke å foreslå.
const paaStor = { agentId: "tilbud", planId: "tilbud_stor", priceNok: 3490, quota: 150, overageNok: 39 };
sjekk("Stor + 400 brukt: ingen større pakke", String(finnBedrePakke(paaStor, 400)), "null");

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
