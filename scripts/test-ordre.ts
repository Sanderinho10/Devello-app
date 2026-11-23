/**
 * Prøve på det rene i ordremodulen: snippets, endringsnotat fra tilbudet,
 * statusovergangene, og tilbudet slik montørappen får det. Uten database.
 *
 *   npm run test:ordre
 */
import { tilbudForApp } from "@/lib/app/lese";
import { filtrer, finnUtloeser, lesSnippet, settInn } from "@/lib/ordre/snippets";
import { lovligeOverganger } from "@/lib/ordre/status";
import { endringsNotat } from "@/lib/ordre/tilbudsendring";
import { erOrderType, type OrderQuoteSnapshot } from "@/lib/types";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}
const lik = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// snippets: «#» åpner lista
sjekk("«#» først i teksten åpner lista", lik(finnUtloeser("#", 1), { start: 0, q: "" }));
sjekk("«#elb» etter mellomrom søker på «elb»", lik(finnUtloeser("Jobb: #elb", 10), { start: 6, q: "elb" }));
sjekk("«#» etter linjeskift", lik(finnUtloeser("Linje\n#sik", 10), { start: 6, q: "sik" }));
sjekk("søket kan ha mellomrom", lik(finnUtloeser("#nytt skap", 10), { start: 0, q: "nytt skap" }));
sjekk("«#» midt i et ord åpner ikke", finnUtloeser("ordre#12", 8) === null);
sjekk("linjeskift etter «#» lukker", finnUtloeser("#elb\nmer", 8) === null);
sjekk("ingen «#» — ingen liste", finnUtloeser("vanlig tekst", 6) === null);
sjekk("markøren foran «#» åpner ikke", finnUtloeser("abc #elb", 3) === null);

// snippets: innsetting
sjekk("«#elb» byttes ut med snippeten", lik(settInn("Jobb: #elb. Ring først.", 6, 10, "Montere elbillader"), { tekst: "Jobb: Montere elbillader. Ring først.", markor: 24 }));
sjekk("settes inn ved markøren uten markering", lik(settInn("AB", 1, 1, "x"), { tekst: "AxB", markor: 2 }));
sjekk("posisjoner utenfor teksten klippes", lik(settInn("AB", 9, 12, "x"), { tekst: "ABx", markor: 3 }));

// snippets: søk og validering
const alle = [
  { name: "Elbillader", text: "Montere lader på vegg." },
  { name: "Sikringsskap", text: "Bytte skap. Elbillader forberedes." },
  { name: "Kjøkken", text: "Nye kurser til kjøkken." },
];
sjekk("tomt søk gir alle", filtrer(alle, " ").length === 3);
sjekk("navnet treffer før innholdet", filtrer(alle, "elbil").map((s) => s.name).join() === "Elbillader,Sikringsskap");
sjekk("søket skiller ikke store og små", filtrer(alle, "KJØK").length === 1);
sjekk("snippet uten navn avvises", "error" in lesSnippet({ name: " ", text: "x" }));
sjekk("snippet uten tekst avvises", "error" in lesSnippet({ name: "x", text: "" }));
sjekk("snippet trimmes", lik(lesSnippet({ name: " Elbil ", text: " Tekst \n" }), { name: "Elbil", text: "Tekst" }));

// endringer fra tilbudet → notat
const linje = (description: string, quantity: number, ny: number, unit = "stk") => ({ description, quantity, ny, unit });
sjekk("ingen endring gir ikke noe notat", endringsNotat([linje("Stikk", 4, 4)], "") === null);
sjekk(
  "endrede linjer med fra og til",
  endringsNotat([linje("Stikkontakt dobbel", 4, 6), linje("Downlight", 8, 0), linje("Kabel", 25, 32.5, "m")], "Avtalt med kunden") ===
    "Endringer fra tilbudet:\n– Stikkontakt dobbel: 4 → 6 stk\n– Downlight: 8 → 0 stk (utgår)\n– Kabel: 25 → 32,5 m\nKommentar: Avtalt med kunden",
);
sjekk("bare kommentar blir også et notat", endringsNotat([linje("Stikk", 4, 4)], "To ekstra stikk") === "Endringer fra tilbudet:\nTo ekstra stikk");

// status: montøren kan si ferdig uten å ha trykket start
sjekk("åpen → ferdig er lov", lovligeOverganger("opna").includes("ferdig"));
sjekk("åpen → pågår er fortsatt lov", lovligeOverganger("opna").includes("paagaar"));
sjekk("fakturert kan ikke endres", lovligeOverganger("fakturert").length === 0);
sjekk("ordretype: bare de to gyldige", erOrderType("fastpris") && erOrderType("tid_og_materiell") && !erOrderType("punktpris") && !erOrderType(null));

// tilbudet i montørappen: postene, uten priser
const snapshot = {
  quote_type: "fastpris",
  quote_no: 1007,
  totals: null,
  document: {
    title: "Nytt sikringsskap",
    assumptions: ["Inntaket beholdes.", " "],
    sections: [
      { title: "Materiell", lines: [{ price_item_id: null, description: "Skap", quantity: 1, unit: "stk", unit_price: 12500, discount_pct: 10 }] },
      { title: "Tom", lines: [] },
    ],
  },
} as unknown as OrderQuoteSnapshot;
const t = tilbudForApp(snapshot);
sjekk("ordre uten tilbud gir null", tilbudForApp(null) === null);
sjekk("postene følger med", t?.sections.length === 1 && t.sections[0].lines[0].description === "Skap" && t.quote_no === 1007);
sjekk("ingen priser til appen", !JSON.stringify(t).includes("12500") && !JSON.stringify(t).includes("price"));
sjekk("tomme forutsetninger siles bort", lik(t?.assumptions, ["Inntaket beholdes."]));

console.log(feil === 0 ? "\nAlle sjekker grønne." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
