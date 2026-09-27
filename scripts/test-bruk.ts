/**
 * Prøve på bruksmerkinga av prisrader — uten database.
 *
 *   npm run test:bruk
 *
 * Saken er den ekte tvetydigheten hos Star Elektro: fire rader er plausible
 * svar på «8 doble stikkontaktar», og navnet skiller dem ikke. Firmaet har
 * brukt én av dem. Prøven sjekker at merket havner på den ene og bare den,
 * at ubrukte rader ikke får noe (223 av 241 er ubrukt — «brukt: 0» på hver
 * ville doblet blokka), og at forklaringen forsvinner når historikken er tom,
 * slik den er for en ny kunde.
 */
import { buildPrompt, type GenerateInput } from "@/lib/claude/generate";
import { bruksforklaring, bruksnotat, type Brukshistorikk } from "@/lib/pricelist/bruk";
import type { PriceListItem } from "@/lib/types";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const rad = (id: string, name: string, unit_price: number): PriceListItem => ({
  id, company_id: "c", price_list_id: "p", kind: "punktpris", code: null,
  name, description: null, unit: "stk", unit_price,
  includes_labour: true, includes_material: true, active: true, position: 0,
});

// Fire plausible svar på det samme. Roger brukar den første.
const prisrader = [
  rad("a", "Montering av dobbel stikkontakt", 890),
  rad("b", "Punkt for Stikkontakt", 775.26),
  rad("c", "Punkt for stikk over benk", 775.26),
  rad("d", "4-veis stikkontakt", 953.23),
];

const bruk: Brukshistorikk = {
  a: { antall: 2, sist: "2026-09-18" },
};

const inn = (b: Brukshistorikk) =>
  ({
    companyId: "c",
    lead: { subject: "S", body_text: "8 doble stikkontaktar", from_name: null, from_email: null },
    company: { name: "F", tone_settings: null },
    priceItems: prisrader,
    bruk: b,
  }) as unknown as GenerateInput;

const { prefiks } = buildPrompt(inn(bruk));

sjekk("den brukte rada blir merkt", /Montering av dobbel stikkontakt[\s\S]*?BRUKT: 2 ganger/.test(prefiks));
sjekk("merket seier når ho sist blei brukt", /sist 2026-09-18/.test(prefiks));
sjekk("berre éi rad er merkt", (prefiks.match(/BRUKT:/g) ?? []).length === 1);
sjekk("dei tre ubrukte får ingenting", !/Punkt for Stikkontakt\n[\s\S]{0,80}BRUKT/.test(prefiks));
sjekk("forklaringa står over lista", /1 av radene under er merket BRUKT/.test(prefiks));
sjekk(
  "forklaringa seier at ei umerkt rad ikkje er feil",
  /ikke feil/.test(prefiks),
);

// Éin gong skal bøyast rett.
sjekk("eitt bruk blir «1 gang»", bruksnotat({ antall: 1, sist: "2026-01-01" })?.includes("1 gang i et sendt tilbud") === true);
sjekk("aldri brukt gir null", bruksnotat(undefined) === null && bruksnotat({ antall: 0, sist: "x" }) === null);

// Ny kunde: ingen historikk, inga forklaring, ingen merke.
const kald = buildPrompt(inn({})).prefiks;
sjekk("ny kunde får ingen merke", !/BRUKT:/.test(kald));
sjekk("ny kunde får inga forklaring", !/merket BRUKT/.test(kald));
sjekk("tom historikk gir tom forklaring", bruksforklaring({}) === "");

// Prislista skal framleis vere komplett — merkinga skal ikkje filtrere noko.
for (const r of prisrader) {
  sjekk(`«${r.name}» står framleis i lista`, kald.includes(r.name));
}

console.log(feil === 0 ? "\nAlt grønt." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
