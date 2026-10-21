/**
 * Tilgangsregelen: hvem som slipper inn, og når en ubetalt faktura
 * deaktiverer kontoen.
 *
 *   npm run test:tilgang
 *
 * Krever ingen database. En feil her stenger kunder ute eller lar dem bruke
 * programmet uten å betale, uten at noen merker det.
 */
import { vurderTilgang } from "@/lib/billing/tilgang-regel";

let feil = 0;
function sjekk(namn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(52)} ${JSON.stringify(faktisk)}${ok ? "" : `   (venta ${JSON.stringify(venta)})`}`);
}

const no = new Date("2026-10-21T12:00:00Z");
const base = { unntak: false, harAbonnement: false, trialEndsAt: null as string | null, fakturaer: [], no };
const faktura = (forfall: string, betalt_at: string | null = null) => ({ fakturanr: "1001", belop_nok: "690.00", forfall, betalt_at });

sjekk("ingen pakke, ingen prøvetid", vurderTilgang(base).grunn, "ingen");
sjekk("ingen pakke → ikke aktiv", vurderTilgang(base).aktiv, false);
sjekk("prøvetid igjen", vurderTilgang({ ...base, trialEndsAt: "2026-10-25T00:00:00Z" }).grunn, "prove");
sjekk("prøvetid ute", vurderTilgang({ ...base, trialEndsAt: "2026-10-20T00:00:00Z" }).grunn, "ingen");
sjekk("pakke", vurderTilgang({ ...base, harAbonnement: true }).grunn, "abonnement");
sjekk("unntak uten pakke", vurderTilgang({ ...base, unntak: true }).aktiv, true);

const ikkeForfalt = vurderTilgang({ ...base, harAbonnement: true, fakturaer: [faktura("2026-10-21")] });
sjekk("forfall i dag er ikke forfalt", ikkeForfalt.ubetalt, null);

const nyleg = vurderTilgang({ ...base, harAbonnement: true, fakturaer: [faktura("2026-10-11")] });
sjekk("10 dager over forfall: aktiv", nyleg.aktiv, true);
sjekk("… varsel med dato", nyleg.ubetalt?.deaktiveres, "2026-11-10");
sjekk("… 20 dager igjen", nyleg.ubetalt?.dagerIgjen, 20);

const siste = vurderTilgang({ ...base, harAbonnement: true, fakturaer: [faktura("2026-09-22")] });
sjekk("29 dager over forfall: fortsatt aktiv", [siste.aktiv, siste.ubetalt?.dagerIgjen], [true, 1]);

const ute = vurderTilgang({ ...base, harAbonnement: true, fakturaer: [faktura("2026-09-21")] });
sjekk("30 dager over forfall: deaktivert", [ute.aktiv, ute.grunn], [false, "deaktivert"]);

const betalt = vurderTilgang({ ...base, harAbonnement: true, fakturaer: [faktura("2026-08-01", "2026-08-30T10:00:00Z")] });
sjekk("betalt faktura teller ikke", [betalt.aktiv, betalt.ubetalt], [true, null]);

const eldst = vurderTilgang({
  ...base,
  harAbonnement: true,
  fakturaer: [faktura("2026-10-15"), { ...faktura("2026-10-01"), fakturanr: "1000" }],
});
sjekk("eldste forfalte styrer", eldst.ubetalt?.fakturanr, "1000");

const unntakUbetalt = vurderTilgang({ ...base, unntak: true, fakturaer: [faktura("2026-01-01")] });
sjekk("unntak: aldri varsel eller sperre", [unntakUbetalt.aktiv, unntakUbetalt.ubetalt], [true, null]);

if (feil) {
  console.log(`\n${feil} feil`);
  process.exit(1);
}
console.log("\nAlt stemmer.");
