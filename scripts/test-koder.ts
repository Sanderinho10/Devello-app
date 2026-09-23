import {
  erOverskrift,
  kategoriForSeksjon,
  kategorierAv,
  kodeFinnes,
  nesteKode,
  prefiksAv,
} from "@/lib/pricelist/koder";
import type { PriceListItem } from "@/lib/types";

/**
 * Kodene i prisfila: prefikset er kategorien, og neste kode skal havne der
 * man leter etter den.
 */

let feil = 0;
function sjekk(navn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${navn.padEnd(50)} ${JSON.stringify(faktisk)}${ok ? "" : ` (venta ${JSON.stringify(venta)})`}`);
}

const rad = (code: string | null, name: string, unit_price = 1000): PriceListItem => ({
  id: `${code}-${name}`,
  company_id: "c",
  price_list_id: "l",
  kind: "punktpris",
  code,
  name,
  description: null,
  unit: "stk",
  unit_price,
  includes_labour: true,
  includes_material: true,
  position: 0,
  active: true,
});

const fil = [
  rad("B", "Bad", 0),
  rad("B001", "Kursfremlegg bad"),
  rad("B022", "Varmekabel"),
  rad("P", "Punktpriser", 0),
  rad("P001", "Stikkontakt"),
  rad("P001,02", "4-veis stikkontakt"),
  rad("P062", "Lampepunkt"),
  rad("PT001", "Aiphone modul"),
  rad("PT003", "Aiphone ramme"),
  rad("PT008", "Aiphone boks"),
  rad("PT0031", "Aiphone 3-moduls ramme"),
  rad("EL", "Elbil lader", 0),
  rad("EL007", "Ombygging sikringsskap"),
  rad("SR095", "Sikringsskap"),
  rad(null, "Uten kode"),
];

sjekk("prefiks av el040", prefiksAv("el040"), "EL");
sjekk("prefiks av P001,02", prefiksAv("P001,02"), "P");
sjekk("prefiks uten bokstaver", prefiksAv("123"), null);
sjekk("overskrift B / 0 kr", erOverskrift(rad("B", "Bad", 0)), true);
sjekk("B001 er ikke overskrift", erOverskrift(rad("B001", "x")), false);

sjekk(
  "kategoriene",
  kategorierAv(fil).map((k) => `${k.prefiks}:${k.navn}:${k.antall}`),
  ["B:Bad:2", "P:Punktpriser:3", "PT:null:4", "EL:Elbil lader:1", "SR:null:1"],
);

sjekk("neste i B", nesteKode("B", fil), "B023");
sjekk("neste i P (varianter teller ikke)", nesteKode("P", fil), "P063");
sjekk("PT: hovedpostene bestemmer sifrene", nesteKode("PT", fil), "PT009");
sjekk("P blandes ikke med PT", nesteKode("P", fil).startsWith("PT"), false);
sjekk("små bokstaver", nesteKode("el", fil), "EL008");
sjekk("ny kategori", nesteKode("V", fil), "V001");

sjekk("kode finnes, små bokstaver", kodeFinnes("b001", fil), true);
sjekk("kode finnes ikke", kodeFinnes("B023", fil), false);

const kategorier = kategorierAv(fil);
sjekk("seksjon «Bad» → B", kategoriForSeksjon("Bad", kategorier)?.prefiks, "B");
sjekk("seksjon «Elbil lader garasje» → EL", kategoriForSeksjon("Elbil lader garasje", kategorier)?.prefiks, "EL");
sjekk("seksjon uten treff", kategoriForSeksjon("Gulvvarme", kategorier), null);

if (feil > 0) {
  console.error(`\n${feil} feil`);
  process.exit(1);
}
console.log("\nAlt ok");
