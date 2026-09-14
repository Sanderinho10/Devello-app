/**
 * Prøve på prisfilvasken — uten database.
 *
 *   npm run test:prisvask
 *
 * Saken er Star Elektros egen prisliste i miniatyr: vanlige punktpriser, noen
 * rader til 0 kr der én er tilsiktet («Samsvarserklæring») og én er en
 * NS-overskrift («Solcelleanlegg»), en jobbsum limt inn som enhetspris, og et
 * duplikat. Poenget med prøven er at vasken FINNER dem uten å påstå hvilken
 * nullrad som er hvilken — den forskjellen er det bare et menneske som vet.
 */
import { vaskPrisliste, vaskSamandrag, type VaskRad } from "@/lib/pricelist/vask";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const rad = (name: string, unit_price: number, unit = "stk"): VaskRad => ({ name, unit, unit_price });

const liste: VaskRad[] = [
  rad("Montering stikkontakt, dobbel", 890),
  rad("Montering takpunkt med bryter", 1340),
  rad("Ny kurs fra sikringsskap", 2450),
  rad("Punkt for stikkontakt", 775),
  rad("Ladeplate for elbillader", 2069),
  rad("Pakkepris Easee elbillader 32A", 12452),
  // To nullrader med helt ulik grunn — vasken skal ikke skille dem selv.
  rad("Samsvarserklæring for utført arbeid", 0),
  rad("Solcelleanlegg", 0),
  // En jobbsum limt inn som enhetspris.
  rad("Autrosafe System", 911300),
  // Duplikat med ulik pris: dette er det verste tilfellet, for agenten
  // velger vilkårlig og ingen ser det.
  rad("Oppmøte servicebil", 690),
  rad("oppmøte  servicebil", 560),
];

const vask = vaskPrisliste(liste);
const typer = vask.funn.map((f) => f.type);

sjekk("finn alle tre typane", new Set(typer).size === 3, typer.join(", "));

const utanPris = vask.funn.find((f) => f.type === "uten_pris")!;
sjekk("begge nullradene blir funne", utanPris.rader.length === 2);
sjekk(
  "vasken påstår ikkje kva som er rett — brukaren får tre val",
  utanPris.valg.length === 3 && utanPris.valg.some((v) => /Inkludert i jobben/.test(v)) && utanPris.valg.some((v) => /Mangler pris/.test(v)),
);
sjekk("teksten seier kva som er observert, ikkje kva som er gale", /står til 0 kr/.test(utanPris.tekst) && !/feil|galt/i.test(utanPris.tekst));

const uteligger = vask.funn.find((f) => f.type === "uteligger")!;
sjekk("jobbsummen blir funnen", uteligger.rader.length === 1 && uteligger.rader[0].name === "Autrosafe System");
sjekk("pakkeprisen på 12 452 er IKKJE ein uteliggjar", !uteligger.rader.some((r) => /Easee/.test(r.name)));

const duplikat = vask.funn.find((f) => f.type === "duplikat")!;
sjekk("duplikat blir funne trass i ulik skrivemåte og ulik pris", duplikat.rader.length === 2);

sjekk("rader utan funn blir talde", vask.reine === liste.length - 5, `${vask.reine}`);
sjekk("størst funn kjem først", vask.funn[0].rader.length >= vask.funn[vask.funn.length - 1].rader.length);

const samandrag = vaskSamandrag(vask)!;
sjekk("samandraget nemner alle tre", /uten pris/.test(samandrag) && /uvanlig høy/.test(samandrag) && /samme navn/.test(samandrag));

// Ei rein liste skal ikkje gi eit einaste kort.
const rein = vaskPrisliste([rad("Stikkontakt", 890), rad("Takpunkt", 1340), rad("Ny kurs", 2450)]);
sjekk("rein liste gir ingen funn", rein.funn.length === 0 && rein.reine === 3);
sjekk("rein liste gir ikkje noko samandrag", vaskSamandrag(rein) === null);

// Ei tom liste skal ikkje krasje.
const tom = vaskPrisliste([]);
sjekk("tom liste er trygg", tom.funn.length === 0 && tom.antallRader === 0);

// Ei liste der ALT er 0 skal ikkje gi uteliggjarar (median er 0).
const alleNull = vaskPrisliste([rad("A", 0), rad("B", 0)]);
sjekk("liste med berre nullrader gir ingen uteliggjarar", !alleNull.funn.some((f) => f.type === "uteligger"));

console.log(feil === 0 ? "\nAlt grønt." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
