import { htmlTilTekst, lesEpostfil, videresendtFra } from "@/lib/leads/les-epostfil";

/**
 * E-post dratt inn i «Manuell henvendelse».
 *
 * Det som må holde: kunden blir mottaker — ikke kollegaen som videresendte,
 * ikke noreply-adressen til kontaktskjemaet — og teksten agenten får er
 * leselig også når e-posten bare hadde HTML.
 */

let feil = 0;
function sjekk(navn: string, faktisk: unknown, venta: unknown) {
  const ok = JSON.stringify(faktisk) === JSON.stringify(venta);
  if (!ok) feil++;
  console.log(`${ok ? "ok  " : "FEIL"} ${navn.padEnd(52)} ${JSON.stringify(faktisk)}${ok ? "" : ` (venta ${JSON.stringify(venta)})`}`);
}

const eml = (hode: string, kropp: string) =>
  new TextEncoder().encode(`${hode}\r\nMIME-Version: 1.0\r\n\r\n${kropp}`).buffer as ArrayBuffer;

// 1. Vanlig e-post fra kunden
const vanlig = await lesEpostfil(
  "a.eml",
  eml(
    'From: "Marit Aasen" <Marit@Example.no>\r\nSubject: Stikkontakter i kjellerstua\r\nContent-Type: text/plain; charset=utf-8',
    "Hei!\r\n\r\nVi trenger åtte doble stikkontakter i kjellerstua.\r\n\r\nMvh Marit",
  ),
);
sjekk("navn fra avsender", vanlig.navn, "Marit Aasen");
sjekk("adresse i små bokstaver", vanlig.epost, "marit@example.no");
sjekk("emnet først i teksten", vanlig.tekst.split("\n")[0], "Stikkontakter i kjellerstua");
sjekk("æøå overlever", vanlig.tekst.includes("åtte doble"), true);

// 2. Kontaktskjema: noreply sender, kunden i Reply-To
const skjema = await lesEpostfil(
  "b.eml",
  eml(
    "From: Nettside <noreply@starelektro.no>\r\nReply-To: ola@nordmann.no\r\nSubject: Ny henvendelse fra skjema\r\nContent-Type: text/plain; charset=utf-8",
    "Navn: Ola Nordmann\r\nMelding: Elbillader i garasjen",
  ),
);
sjekk("skjema: kunden fra Svar-til", skjema.epost, "ola@nordmann.no");
sjekk("skjema: ikke nettsidens navn", skjema.navn, null);

// 3. Videresendt fra en kollega
const vidare = await lesEpostfil(
  "c.eml",
  eml(
    "From: Roger <roger@starelektro.no>\r\nSubject: VS: Tilbud på sikringsskap\r\nContent-Type: text/plain; charset=utf-8",
    "Kan du ta denne?\r\n\r\nFra: Kari Nordvik <kari@nordvik.no>\r\nSendt: mandag 1. september\r\nTil: post@starelektro.no\r\nEmne: Tilbud på sikringsskap\r\n\r\nHei, vi vil bytte sikringsskap.",
  ),
);
sjekk("videresendt: kunden, ikke kollegaen", vidare.epost, "kari@nordvik.no");
sjekk("videresendt: kundens navn", vidare.navn, "Kari Nordvik");
sjekk("videresendt: VS: fjernet fra emnet", vidare.emne, "Tilbud på sikringsskap");

sjekk("Outlook [mailto:]", videresendtFra("From: Per Hansen [mailto:per@hansen.no]\nSent: …"), { navn: "Per Hansen", epost: "per@hansen.no" });
sjekk("bare adresse", videresendtFra("Fra: per@hansen.no"), { navn: null, epost: "per@hansen.no" });
sjekk("ingen fra-linje", videresendtFra("Hei, dette er bare tekst."), null);

// 4. Bare HTML
const html = await lesEpostfil(
  "d.eml",
  eml(
    "From: kunde@example.no\r\nSubject: Lys\r\nContent-Type: text/html; charset=utf-8",
    "<html><head><style>p{color:red}</style></head><body><p>Hei,</p><p>Lyset blinker i gang&nbsp;og p&aring; bad.</p><ul><li>Stue</li><li>Bad</li></ul></body></html>",
  ),
);
sjekk("html: stil er borte", html.tekst.includes("color"), false);
sjekk("html: entiteter", html.tekst.includes("gang og på bad."), true);
sjekk("html: punktliste", html.tekst.includes("- Stue\n- Bad"), true);
sjekk("htmlTilTekst br", htmlTilTekst("a<br>b"), "a\nb");

// 5. Vedlegg
const vedlegg = await lesEpostfil(
  "e.eml",
  eml(
    'From: kunde@example.no\r\nSubject: Bilder\r\nContent-Type: multipart/mixed; boundary="X"',
    '--X\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nSe bilder.\r\n--X\r\nContent-Type: image/jpeg\r\nContent-Disposition: attachment; filename="sikringsskap.jpg"\r\nContent-Transfer-Encoding: base64\r\n\r\n/9j/\r\n--X--',
  ),
);
sjekk("vedlegg: navnet er med", vedlegg.vedlegg, ["sikringsskap.jpg"]);
sjekk("vedlegg: nevnt i teksten", vedlegg.tekst.includes("[Vedlegg i e-posten som ikke er lest: sikringsskap.jpg]"), true);

if (feil > 0) {
  console.log(`\n${feil} feil.`);
  process.exit(1);
}
console.log("\nAlle testar passerte.");
