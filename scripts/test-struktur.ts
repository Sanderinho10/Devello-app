/**
 * Prøve på strukturlæringen — uten database.
 *
 *   npm run test:struktur
 *
 * Saken er Star Elektros seks bekreftede tilbud, med den oppdelingen de
 * faktisk har: jobbseksjonen (som skifter navn fra tilbud til tilbud),
 * «Dokumentasjon» med de samme to postene i alle seks, og «Diverse» i ett.
 *
 * Det som skal skje er at «Dokumentasjon» blir funnet som fast bolk med sine
 * to poster, at «Diverse» IKKE blir det (ett av seks er ikke et mønster), og
 * at jobbseksjonene ikke slås sammen bare fordi de står på samme plass.
 */
import { finnStruktur, strukturBlokk } from "@/lib/referanser/struktur";
import type { QuoteReference, ReferenceLine } from "@/lib/referanser";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

const l = (seksjon: string | null, beskrivelse: string): ReferenceLine => ({
  seksjon,
  beskrivelse,
  antall: 1,
  enhet: "stk",
  enhetspris_eks_mva: 0,
});

const DOK = [
  l("Dokumentasjon", "Dokumentasjon av installasjonen i henhold til NEK 400"),
  l("Dokumentasjon", "Samsvarserklæring for utført arbeid"),
];

function ref(id: string, linjer: ReferenceLine[]): QuoteReference {
  return {
    id,
    quote_type: "punktpris",
    title: "Tilbud",
    customer_type: "forbruker",
    tags: [],
    summary: null,
    lines: linjer,
    assumptions: [],
    email_subject: null,
    email_body: null,
    subtotal_ex_vat: null,
    edited_by_user: false,
    edit_summary: null,
    outcome: null,
    confirmed_at: "2026-09-01",
  };
}

const seks = [
  ref("1", [l("Elbillader", "Pakkepris Easee elbillader"), ...DOK]),
  ref("2", [l("Elbillader", "Pakkepris Easee elbillader"), ...DOK]),
  ref("3", [l("Elbillader", "Pakkepris Easee elbillader"), ...DOK]),
  ref("4", [
    l("Installasjon av elbillader", "Pakkepris installasjon, lader fra kunde"),
    ...DOK,
    l("Diverse", "Arbeidstimer"),
    l("Diverse", "Servicebil / oppmøte"),
  ]),
  ref("5", [l("Installasjon av elbillader", "Pakkepris Easee elbillader"), ...DOK]),
  ref("6", [l("Installasjon av elbillader", "Pakkepris installasjon, lader fra kunde"), ...DOK]),
];

const s = finnStruktur(seks)!;

sjekk("seks tilbod blir talde", s.tilbud === 6);
sjekk("typisk to seksjonar", s.typiskAntall === 2, `${s.typiskAntall}`);

const dok = s.bolker.find((b) => b.tittel === "Dokumentasjon");
sjekk("«Dokumentasjon» blir funnen som fast bolk", dok?.antall === 6);
sjekk(
  "begge dokumentasjonspostane blir funne som faste",
  dok?.fastePoster.length === 2 &&
    dok.fastePoster.some((p) => /Samsvarserkl/.test(p)) &&
    dok.fastePoster.some((p) => /NEK 400/.test(p)),
  dok?.fastePoster.join(" | "),
);

sjekk(
  "«Diverse» i eitt av seks er ikkje eit mønster",
  !s.bolker.some((b) => b.tittel === "Diverse"),
);

sjekk(
  "jobbseksjonen med to ulike namn blir ikkje slått saman",
  !s.bolker.some((b) => /elbillader/i.test(b.tittel) && b.antall === 6),
);

sjekk("jobbseksjonen kjem før Dokumentasjon", s.bolker[0].plass <= (dok?.plass ?? 99));

// Blokka
const blokk = strukturBlokk(s);
sjekk("blokka seier kor mange tilbod ho byggjer på", /6 bekreftede tilbud/.test(blokk));
sjekk("blokka listar dei faste postane", /Samsvarserkl/.test(blokk) && /NEK 400/.test(blokk));
sjekk("blokka seier at ein fast bolk ikkje skal falle bort i stillheit", /stillhet/.test(blokk));
sjekk("blokka nemner ikkje «Diverse»", !/## Diverse/.test(blokk));

// Grensetilfelle
sjekk("under tre tilbod gir ingen struktur", finnStruktur(seks.slice(0, 2)) === null);
sjekk("tomt gir ingen struktur", finnStruktur([]) === null);
sjekk("blokka er tom streng når det ikkje finst struktur", strukturBlokk(null) === "");

// Gamle referansar utan seksjon skal ikkje telje.
const utanSeksjon = seks.map((r) => ref(r.id, r.lines.map((x) => l(null, x.beskrivelse))));
sjekk("referansar utan seksjon gir ingen struktur", finnStruktur(utanSeksjon) === null);

// Seks tilbod der berre tre har seksjon: skal framleis gi struktur, av dei tre.
const blanda = [...seks.slice(0, 3), ...utanSeksjon.slice(0, 3)];
const b = finnStruktur(blanda)!;
sjekk("berre tilboda med seksjon blir talde", b.tilbud === 3, `${b.tilbud}`);

console.log(feil === 0 ? "\nAlt grønt." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
