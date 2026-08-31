/**
 * Anonymiseringen av læringsdataene.
 *
 *   npm run test:anonym
 *
 * To ting testes, og den andre er den viktigste: at personopplysninger
 * forsvinner, OG at resten av tilbudet står igjen. En anonymisering som
 * spiser mengder, beløp og postnavn gjør referansen ubrukelig som
 * læringsdata — og da har vi byttet én skade mot en annen.
 */
import { anonymiser } from "@/lib/personvern/anonymiser";

let feil = 0;

function borte(namn: string, tekst: string, kjente: object, ...maaVekk: string[]) {
  const ut = anonymiser(tekst, kjente);
  const att = maaVekk.filter((v) => ut.toLowerCase().includes(v.toLowerCase()));
  const ok = att.length === 0;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(52)} ${ok ? "" : `står igjen: ${att.join(", ")}`}`);
  if (!ok) console.log(`      ${JSON.stringify(ut)}`);
}

function staar(namn: string, tekst: string, kjente: object, ...maaStaa: string[]) {
  const ut = anonymiser(tekst, kjente);
  const vekk = maaStaa.filter((v) => !ut.includes(v));
  const ok = vekk.length === 0;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(52)} ${ok ? "" : `spist: ${vekk.join(", ")}`}`);
  if (!ok) console.log(`      ${JSON.stringify(ut)}`);
}

const kunde = {
  navn: "Halvard Langhelle",
  epost: "halvard.langhelle@gmail.com",
  telefon: "40187690",
  adresse: "Eidsvågskogen 10",
};

console.log("— det som skal bort —");
borte("fullt navn", "Hei Halvard Langhelle,", kunde, "Halvard", "Langhelle");
borte("fornavn alene i hilsen", "Hei Halvard,\n\nTakk for henvendelsen.", kunde, "Halvard");
borte("e-post vi kjenner", "Send svar til halvard.langhelle@gmail.com", kunde, "@gmail.com");
borte("e-post vi IKKE kjenner", "Kontakt hawry1408@hotmail.com", {}, "hawry1408");
borte("telefon uten mellomrom", "Ring 40187690", kunde, "40187690");
borte("telefon med mellomrom", "Tlf 401 87 690", {}, "401 87 690");
borte("telefon med landkode", "Mobil +47 401 87 690", {}, "401 87 690");
borte("adresse vi kjenner", "Arbeidet utføres i Eidsvågskogen 10.", kunde, "Eidsvågskogen 10");
borte("gateadresse vi IKKE kjenner", "Adresse: Storgata 14B", {}, "Storgata 14");
borte("postnummer og poststed", "5101 Eidsvågneset", {}, "Eidsvågneset");
borte("navn i signatur", "Med vennlig hilsen\nHalvard Langhelle", kunde, "Langhelle");

console.log("\n— det som skal stå igjen —");
staar("mengder og enheter", "4 spotter med dimmer, 2 stk stikkontakt", kunde, "4 spotter", "2 stk");
staar("beløp", "Sum eks. mva: 12 500 kr", kunde, "12 500");
staar("kvadratmeter", "Bad på 4 m² med varmekabel", kunde, "4 m²", "varmekabel");
staar("postnr uten poststed", "Tilbud nr. 5101 gjelder i 30 dager", kunde, "5101", "30 dager");
staar("varekode", "Punkt for termostat - Microtemp MTC4", kunde, "MTC4", "termostat");
staar("firmanavn", "Med vennlig hilsen\nStar Elektro AS", kunde, "Star Elektro AS");
staar("selve jobben", "Varmekabel med termostat, vaskemaskin, tørketrommel", kunde,
  "Varmekabel", "vaskemaskin", "tørketrommel");
staar("hilsen-strukturen", "Hei Halvard,\n\nTakk for henvendelsen.", kunde,
  "Hei [kunde],", "Takk for henvendelsen.");
staar("kursnummer", "Ny kurs 16A i sikringsskap", kunde, "16A", "sikringsskap");
staar("årstall", "Anlegget er fra 2018", kunde, "2018");

console.log("\n— hele e-posten —");
const epost = `Hei Halvard,

Takk for henvendelsen. Vi har satt opp et tilbud på den elektriske installasjonen
på badet på 4 m², med varmekabel og termostat, opplegg for vaskemaskin,
tørketrommel og vifte, punkt ved speil, stikkontakt ved servant, samt fire
spotter med dimmer.

Arbeidet utføres i Eidsvågskogen 10, 5101 Eidsvågneset.
Spørsmål? Ring 401 87 690 eller svar på halvard.langhelle@gmail.com.

Med vennlig hilsen
Star Elektro AS`;
console.log(anonymiser(epost, kunde).split("\n").map((l) => `  ${l}`).join("\n"));

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
