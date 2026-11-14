/**
 * Behaldninga i ein bil: summering av rørsler, nøklar og oppteljing.
 *
 *   npm run test:lager
 *
 * Krev ingen database.
 */
export {};

const { lagerNokkel, lagerverdi, reknBehaldning, teljedifferanse } = await import("@/lib/lager/behaldning");
const { finnOrdrenummer } = await import("@/lib/regnskap/matching");

let feil = 0;
function sjekk(namn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(56)} ${JSON.stringify(faktisk)}${ok ? "" : `   (venta ${JSON.stringify(venta)})`}`);
}

let teljar = 0;
function r(
  kind: "inn" | "uttak" | "justering",
  quantity: number,
  vare: { item_no?: string | null; name?: string; unit?: string; cost_price?: number | null; supplier_item_id?: string | null } = {},
) {
  teljar += 1;
  return {
    kind,
    quantity,
    item_no: vare.item_no === undefined ? "1234567" : vare.item_no,
    name: vare.name ?? "Kabel PR 3G2,5",
    unit: vare.unit ?? "m",
    cost_price: vare.cost_price === undefined ? 10 : vare.cost_price,
    supplier_item_id: vare.supplier_item_id ?? null,
    created_at: `2026-11-${String(teljar).padStart(2, "0")}T10:00:00Z`,
  };
}

// Nøklar: elnummeret når det finst, elles namn og eining utan omsyn til bokstavstorleik.
sjekk("nøkkel med elnummer", lagerNokkel({ item_no: " 1234567 ", name: "X", unit: "stk" }), "nr:1234567");
sjekk("nøkkel utan elnummer", lagerNokkel({ item_no: null, name: " Strips 200 ", unit: "STK" }), "namn:strips 200|stk");
sjekk(
  "same vare, ulikt skrive",
  lagerNokkel({ item_no: "", name: "strips 200", unit: "stk" }) === lagerNokkel({ item_no: null, name: "Strips 200", unit: "Stk" }),
  true,
);

// Inn og ut
teljar = 0;
let varer = reknBehaldning([r("inn", 100), r("uttak", -30), r("uttak", -20.5)]);
sjekk("100 inn, 50,5 ut", varer.map((v) => [v.quantity, v.verdi]), [[49.5, 495]]);

// Same elnummer med ulikt namn frå faktura og katalog er éi vare. Siste innkjøp gir namn og pris.
teljar = 0;
varer = reknBehaldning([
  r("inn", 10, { name: "PR 3G2,5 100M", cost_price: 9 }),
  r("uttak", -4, { name: "Kabel PR 3G2,5" }),
  r("inn", 10, { name: "Kabel PR 3G2,5 trommel", cost_price: 12 }),
]);
sjekk("éi vare på tvers av namn", varer.length, 1);
sjekk("namn og pris frå siste innkjøp", [varer[0].name, varer[0].cost_price, varer[0].quantity], ["Kabel PR 3G2,5 trommel", 12, 16]);

// Uttak utan innkjøp: minus, og verdien er 0 — ikkje negativ.
teljar = 0;
varer = reknBehaldning([r("uttak", -3, { item_no: null, name: "Koblingsboks", unit: "stk", cost_price: 45 })]);
sjekk("i minus", [varer[0].quantity, varer[0].verdi, varer[0].cost_price], [-3, 0, 45]);

// Tomme varer er borte frå lista, men kan hentast fram for oppteljing.
teljar = 0;
const tom = [r("inn", 5), r("uttak", -5)];
sjekk("tom vare er ikkje med", reknBehaldning(tom).length, 0);
sjekk("tom vare med medTomme", reknBehaldning(tom, { medTomme: true }).map((v) => v.quantity), [0]);

// Flyttal: 0,1 + 0,2 − 0,3 skal bli 0, ikkje 5,5e-17.
teljar = 0;
sjekk("avrunding til tre desimalar", reknBehaldning([r("inn", 0.1), r("inn", 0.2), r("uttak", -0.3)]).length, 0);

// Rekkjefølgja på rørslene inn skal ikkje ha noko å seie.
teljar = 0;
const a = r("inn", 10, { cost_price: 9 });
const b = r("inn", 10, { cost_price: 12 });
sjekk("usortert inn gir same pris", reknBehaldning([b, a])[0].cost_price, 12);

// Fleire varer, sortert på namn, og samla verdi.
teljar = 0;
varer = reknBehaldning([
  r("inn", 2, { item_no: "2", name: "Stikk", unit: "stk", cost_price: 50 }),
  r("inn", 10, { item_no: "1", name: "Boks", unit: "stk", cost_price: 5.555 }),
  r("inn", 1, { item_no: null, name: "Diverse", unit: "stk", cost_price: null }),
]);
sjekk("sortert på namn", varer.map((v) => v.name), ["Boks", "Diverse", "Stikk"]);
sjekk("verdi utan pris er 0", varer[1].verdi, 0);
sjekk("samla verdi", lagerverdi(varer), 155.55);

// Oppteljing
sjekk("talt færre", teljedifferanse(49.5, 40), -9.5);
sjekk("talt fleire", teljedifferanse(-3, 2), 5);
sjekk("talt det same", teljedifferanse(12, 12), 0);

// Bilen deler nummerserie med ordrane: fakturaen finn han på same måten.
const ordrar = new Set([1001, 1002]);
const bilar = new Set([1003]);
const gyldige = new Set([...ordrar, ...bilar]);
sjekk("bilnummer i ordrereferansen", finnOrdrenummer(["Bil 1003 Martin"], gyldige), 1003);
sjekk("ordre og bil på same linje er tvitydig", finnOrdrenummer(["1001 / 1003"], gyldige), null);
sjekk("første kandidat vinn", finnOrdrenummer(["1003", "ordre 1001"], gyldige), 1003);

console.log(feil ? `\n${feil} feil` : "\nAlt ok");
process.exit(feil ? 1 : 0);
