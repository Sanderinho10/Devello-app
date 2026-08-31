/**
 * Uthentingen av e-postadresse fra fritekst.
 *
 *   npm run test:epost
 *
 * Krever ingen database og ingen nøkler. Bommer denne, går tilbudet til feil
 * adresse eller ingen adresse — og begge deler oppdages først hos kunden.
 */
import { finnEpost } from "@/lib/leads/finn-epost";
let feil = 0;
function sjekk(inn: string | null, venta: string | null) {
  const fekk = finnEpost(inn);
  const ok = fekk === venta;
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${JSON.stringify(inn).slice(0, 62).padEnd(64)} -> ${JSON.stringify(fekk)}${ok ? "" : `  (venta ${JSON.stringify(venta)})`}`);
}

sjekk("Elinstallasjon bad:\n4m2 bad\nVifte\n\nHalvard.langhelle@gmail.com", "halvard.langhelle@gmail.com");
sjekk("Ring meg på 91386194 eller kari.berg@example.no", "kari.berg@example.no");
sjekk("Adressa er post@star-elektro.no.", "post@star-elektro.no");
sjekk("Skriv til meg: ola@sub.domene.co.uk!", "ola@sub.domene.co.uk");
sjekk("(noah+tilbud@gmail.com)", "noah+tilbud@gmail.com");
sjekk("e-post: OLA@FIRMA.NO", "ola@firma.no");
sjekk("Ingen adresse her, berre tekst.", null);
sjekk("", null);
sjekk(null, null);
sjekk("Snakk med meg @ kontoret", null);
sjekk("pris 100@ stk", null);
sjekk("to stk: ein@a.no og to@b.no", "ein@a.no");
sjekk("Kontakt: kari@bedrift.no\nRoger@star-elektro.no", "kari@bedrift.no");
sjekk("halvard@gmail.com,", "halvard@gmail.com");
sjekk("<per@firma.no>", "per@firma.no");
console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
