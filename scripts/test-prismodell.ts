/**
 * Prismodellen — rein logikk, utan database.
 *
 *   npm run test:prismodell
 *
 * Reknestykket som avgjer kva kunden får på rekninga. Tala er rekna for
 * hand og står her, så ei endring i katalogen som flyttar ei krone blir
 * synleg før ho når ein kunde.
 */
import { PAKKAR, finnPakke } from "@/lib/billing/katalog";
import { finnBedrePakke, gjeldandePeriode, konverterGammalAvtale, kostnadsdeling, periodekostnad, type Forbruk } from "@/lib/billing/subscription";
import { modularFor } from "@/lib/moduler";

let feil = 0;
function sjekk(namn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(58)} ${JSON.stringify(faktisk)}${ok ? "" : `   (venta ${JSON.stringify(venta)})`}`);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

const tilbud = finnPakke("tilbud")!;
const ordre = finnPakke("ordre")!;
const plattform = finnPakke("plattform")!;
const mikro = finnPakke("mikro")!;
sjekk("katalogen har fire pakkar", PAKKAR.map((p) => p.id), ["tilbud", "ordre", "plattform", "mikro"]);

// Periodekostnad med 12 tilbod, 8 fakturaer, 3 montørar ------------------------
const f: Forbruk = { tilbud: 12, faktura: 8, appBrukarar: 3 };
sjekk("Tilbud: 390 + 12×29", periodekostnad(tilbud, f), 738);
sjekk("Ordre: 490 + 8×9 + 3×59", periodekostnad(ordre, f), 739);
sjekk("Plattform: 690 + 12×29 + 8×9 + 3×59", periodekostnad(plattform, f), 1287);
const m = kostnadsdeling(mikro, f);
sjekk("Mikro: 20 einingar er under 100 → 0 for einingar", m.einingar, 0);
sjekk("Mikro: 3 montørar − 1 inkludert = 2 × 59 for den månaden", m.appBrukarar, 118);
sjekk("Mikro: sum for perioden", m.sum, 2490 + 118);
sjekk("Mikro med 130 einingar: 30 × 29 over", kostnadsdeling(mikro, { tilbud: 100, faktura: 30, appBrukarar: 0 }).einingar, 870);
sjekk("Mikro: montør-månadar summert for året (7 over × 59)", kostnadsdeling(mikro, { tilbud: 0, faktura: 0, appBrukarar: 2, appBrukarMaanadar: 7 }).appBrukarar, 413);
sjekk("utan forbruk = grunnprisen", PAKKAR.map((p) => periodekostnad(p, { tilbud: 0, faktura: 0, appBrukarar: 0 })), [390, 490, 690, 2490]);

// Betre pakke -----------------------------------------------------------------
sjekk("på Tilbud med 12/8/3: ingen forslag (Ordre manglar tilbud, Plattform dyrare, Mikro er årspakke)", finnBedrePakke({ ...tilbud, packageId: "tilbud" }, f), null);
sjekk("på Ordre med 0/8/3: ingen forslag (Plattform 200 dyrare)", finnBedrePakke({ ...ordre, packageId: "ordre" }, { tilbud: 0, faktura: 8, appBrukarar: 3 }), null);
const gammalBasis = konverterGammalAvtale({ price_nok: 790, included_quota: 30, overage_nok: 29 });
sjekk("gammal Basis med 12 tilbod: foreslår Tilbud (790 → 738, sparar 52)", finnBedrePakke({ ...gammalBasis, moduler: ["tilbud"] }, { tilbud: 12, faktura: 0, appBrukarar: 0 })?.pakke.id, "tilbud");
sjekk("gammal Basis med 12 tilbod: sparar 52 kr/mnd", finnBedrePakke({ ...gammalBasis, moduler: ["tilbud"] }, { tilbud: 12, faktura: 0, appBrukarar: 0 })?.sparerKrPerMaanad, 52);
sjekk("gammal Basis med 30 tilbod: ingen forslag (790 < 1260)", finnBedrePakke({ ...gammalBasis, moduler: ["tilbud"] }, { tilbud: 30, faktura: 0, appBrukarar: 0 }), null);
sjekk("gammal Basis med 13 tilbod: berre 13 kr sparing → under 50, ingen forslag", finnBedrePakke({ ...gammalBasis, moduler: ["tilbud"] }, { tilbud: 13, faktura: 0, appBrukarar: 0 }), null);
const gammalPro = konverterGammalAvtale({ price_nok: 1490, included_quota: 100, overage_nok: 29 });
sjekk("gammal Pro med 20 tilbod: foreslår Tilbud, sparar 520", finnBedrePakke({ ...gammalPro, moduler: ["tilbud"] }, { tilbud: 20, faktura: 0, appBrukarar: 0 })?.sparerKrPerMaanad, 520);

// Årsperiode ------------------------------------------------------------------
let p = gjeldandePeriode("2026-01-31T10:00:00Z", new Date("2026-06-01T12:00:00Z"), "aar");
sjekk("aar frå 31. januar: slutt 31. januar året etter, ikkje 3. februar", iso(p.slutt), "2027-01-31");
p = gjeldandePeriode("2026-01-31T10:00:00Z", new Date("2027-01-30T12:00:00Z"), "aar");
sjekk("aar: dagen før skiftet er framleis periode 0", p.nummer, 0);
p = gjeldandePeriode("2026-01-31T10:00:00Z", new Date("2027-01-31T12:00:00Z"), "aar");
sjekk("aar: på skiftet → periode 1", [p.nummer, iso(p.start), iso(p.slutt)], [1, "2027-01-31", "2028-01-31"]);
p = gjeldandePeriode("2026-08-16T23:00:35Z", new Date("2026-09-03T12:00:00Z"));
sjekk("maanad (standard) som før", [iso(p.start), iso(p.slutt), p.nummer], ["2026-08-16", "2026-09-16", 0]);

// Konvertering av gamle rader --------------------------------------------------
const gammal = { priceNok: 790, quota: 30, overageNok: 29 };
const foer = (brukt: number) => gammal.priceNok + Math.max(0, brukt - gammal.quota) * gammal.overageNok;
sjekk("konvertert rad: package_id tilbud, included_units 30, unit_prices tilbud 29", [gammalBasis.packageId, gammalBasis.includedUnits, gammalBasis.unitPriceNok.tilbud], ["tilbud", 30, 29]);
for (const brukt of [0, 30, 45]) {
  sjekk(`konvertert Basis med ${brukt} tilbod kostar det same som før (${foer(brukt)})`, periodekostnad(gammalBasis, { tilbud: brukt, faktura: 0, appBrukarar: 0 }), foer(brukt));
}

// Modular frå pakke og prøvetid -------------------------------------------------
const no = new Date("2026-09-28T12:00:00Z");
sjekk("pakke Ordre → [ordre]", modularFor({ packageId: "ordre", trialEndsAt: null, no }), ["ordre"]);
sjekk("pakke Mikro → begge", modularFor({ packageId: "mikro", trialEndsAt: null, no }), ["tilbud", "ordre"]);
sjekk("ingen pakke, prøvetid i framtida → begge", modularFor({ packageId: null, trialEndsAt: "2026-10-15T00:00:00Z", no }), ["tilbud", "ordre"]);
sjekk("ingen pakke, prøvetid ute → ingen", modularFor({ packageId: null, trialEndsAt: "2026-09-15T00:00:00Z", no }), []);
sjekk("pakke vinn over utgått prøvetid", modularFor({ packageId: "tilbud", trialEndsAt: "2026-09-15T00:00:00Z", no }), ["tilbud"]);

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
