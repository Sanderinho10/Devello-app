/**
 * Løpenummeret i e-postemne og brødtekst — rene funksjoner.
 *
 *   npm run test:tilbudsnr
 */
import { harTilbudsnr, medTilbudsnr, medTilbudsnrIKropp } from "@/lib/drafts/tilbudsnr";

let feil = 0;
function sjekk(namn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${namn.padEnd(52)} ${JSON.stringify(faktisk)}${ok ? "" : `   (venta ${JSON.stringify(venta)})`}`);
}

sjekk("emne får suffiks", medTilbudsnr("Gulvvarme bad", 1004), "Gulvvarme bad – Tilbud 1004");
sjekk("emne: idempotent", medTilbudsnr("Gulvvarme bad – Tilbud 1004", 1004), "Gulvvarme bad – Tilbud 1004");
sjekk("emne: gammalt nummer blir bytt", medTilbudsnr("Gulvvarme bad – Tilbud 1003", 1004), "Gulvvarme bad – Tilbud 1004");
sjekk("emne: foran (versjon 2)", medTilbudsnr("Gulvvarme bad (versjon 2)", 1004), "Gulvvarme bad – Tilbud 1004 (versjon 2)");
sjekk("emne: både nummer og versjon frå før", medTilbudsnr("Gulvvarme bad – Tilbud 1004 (versjon 2)", 1004), "Gulvvarme bad – Tilbud 1004 (versjon 2)");
sjekk("emne: Re:-tråd frå kunden", medTilbudsnr("Re: Spørsmål om sikringsskap", 1010), "Re: Spørsmål om sikringsskap – Tilbud 1010");
sjekk("emne: tomt", medTilbudsnr("", 1004), "Tilbud 1004");
sjekk("emne: bindestrek-variant blir normalisert", medTilbudsnr("Bad - Tilbud 1004", 1004), "Bad – Tilbud 1004");

const kropp = "Hei Kari,\n\nTakk for henvendelsen.\n\nMed vennlig hilsen\nRoger";
sjekk("kropp får linje nederst", medTilbudsnrIKropp(kropp, 1004), kropp + "\n\nTilbudsnummer: 1004");
sjekk("kropp: idempotent", medTilbudsnrIKropp(kropp + "\n\nTilbudsnummer: 1004", 1004), kropp + "\n\nTilbudsnummer: 1004");
sjekk("kropp: gammalt nummer blir bytt", medTilbudsnrIKropp(kropp + "\n\nTilbudsnummer: 1003", 1004), kropp + "\n\nTilbudsnummer: 1004");
sjekk("kropp: nummer skrive av brukaren midt i teksten", medTilbudsnrIKropp("Viser til tilbud 1004 under.\n\nHilsen", 1004), "Viser til tilbud 1004 under.\n\nHilsen");
sjekk("harTilbudsnr: «Tilbudsnr. 1004»", harTilbudsnr("Se Tilbudsnr. 1004", 1004), true);
sjekk("harTilbudsnr: anna nummer", harTilbudsnr("Tilbud 1003", 1004), false);
sjekk("harTilbudsnr: 10041 er ikkje 1004", harTilbudsnr("Tilbud 10041", 1004), false);

console.log(feil === 0 ? "\nAlle testar passerte." : `\n${feil} feil.`);
process.exit(feil ? 1 : 0);
