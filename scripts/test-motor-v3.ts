/**
 * Prøve på motor v3 — det som kan prøves uten modell og database.
 *
 *   npm run test:motor
 *
 * Fire ting:
 *
 * 1. Tilbakerullingen holder: agent/v2 lastes byte for byte slik den lå på
 *    rot før v3, i samme rekkefølge.
 * 2. Bransjepakken for elektro er hel: unike id-er, sjekklister, fornuftige
 *    bånd, og «annet» og «sammensatt» finnes som utvei.
 * 3. Omfangsvakten fanger Roger-saka: ti inkluderte arbeidsposter og et utkast
 *    med to poster skal sendes tilbake; seks poster skal slippe gjennom.
 * 4. E-postvaktene: firmaets egen nettadresse i signaturen er lov, andre
 *    nettadresser er ikke, og signaturen godkjennes med normalisert whitespace.
 * 5. Nullprisvakten: en prisrad på 0 kr blir aldri en tilbudslinje.
 */
import path from "node:path";
import { omfangBlokk, omfangSjekk, type Omfang } from "@/lib/claude/omfang";
import { lesTekst, loadBransjepakke, loadMotor, loadMotorV3 } from "@/lib/claude/motor";
import { buildPrompt, harNettadresse, resolve, sluttarMedSignatur, type GenerateInput, type RawTilbudsdata } from "@/lib/claude/generate";
import type { PriceListItem } from "@/lib/types";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

// 1. v2 er frosset ---------------------------------------------------------

const v2Filer = ["CLAUDE.md", "velg-tilbudstype.md", "lag-tilbudsdata.md"];
const v2Forventa = (
  await Promise.all(v2Filer.map((f) => lesTekst(path.join(process.cwd(), "agent", "v2", f))))
).join("\n\n---\n\n");
const v2 = await loadMotor("v2");
sjekk("v2 lastes som CLAUDE + velg-tilbudstype + lag-tilbudsdata, byte for byte", v2 === v2Forventa);
sjekk("v2 er v2 — ikke v3-motoren", /# Devello Tilbudsagent — MOTOR\n/.test(v2) && !/MOTOR v3|Steg 1: Omfang/.test(v2));
sjekk("motoren leses som LF også når git sjekket den ut som CRLF (Windows)", !v2.includes("\r"));

// 2. Bransjepakken ---------------------------------------------------------

const pakke = await loadBransjepakke("elektro");
const ider = pakke.jobbtyper.map((j) => j.id);
sjekk("elektro: minst 12 jobbtyper", pakke.jobbtyper.length >= 12, `${pakke.jobbtyper.length}`);
sjekk("elektro: unike id-er", new Set(ider).size === ider.length);
sjekk("elektro: «annet» og «sammensatt» finnes", ider.includes("annet") && ider.includes("sammensatt"));
sjekk(
  "elektro: hver jobbtype har sjekkliste med minst 2 punkter",
  pakke.jobbtyper.every((j) => j.sjekkliste.length >= 2),
);
sjekk(
  "elektro: bånd er [lav, høy] med lav < høy, eller null",
  pakke.jobbtyper.every((j) => j.band_eks_mva === null || (j.band_eks_mva.length === 2 && j.band_eks_mva[0] < j.band_eks_mva[1])),
);
sjekk(
  "elektro: min_poster er et heltall ≥ 0",
  pakke.jobbtyper.every((j) => Number.isInteger(j.min_poster) && j.min_poster >= 0),
);
sjekk("ukjent fag faller tilbake på elektro", (await loadBransjepakke("tannlege")).fag === "elektro");

const omfangPrompt = await loadMotorV3("omfang", "elektro");
sjekk("v3 omfang-prompt har CLAUDE, steg 1, eksempler og sjekklistene",
  /MOTOR v3/.test(omfangPrompt) && /Steg 1: Omfang/.test(omfangPrompt) && /<example>/.test(omfangPrompt) && /## elbillader/.test(omfangPrompt));
const tilbudPrompt = await loadMotorV3("tilbud", "elektro");
sjekk("v3 tilbud-prompt har CLAUDE, velg-tilbudstype, steg 2 og eksempel",
  /MOTOR v3/.test(tilbudPrompt) && /Velg tilbudstype/.test(tilbudPrompt) && /Steg 2: Fra omfang til tilbud/.test(tilbudPrompt) && /<tilbudsdata>/.test(tilbudPrompt));
sjekk("v3 tilbud-prompt har ikke sjekklistene (de hører til steg 1)", !/## elbillader/.test(tilbudPrompt));

// 3. Omfangsvakten ---------------------------------------------------------

const nybygg = pakke.jobbtyper.find((j) => j.id === "nybygg_tilbygg_komplett")!;
const omfang: Omfang = {
  jobbtype: "nybygg_tilbygg_komplett",
  kundetype: "forbruker",
  status: "utkast",
  arbeidsposter: [
    ...["stikk", "takpunkt", "kurs", "skap", "overspenningsvern", "utelys", "komfyr", "oppvask", "jording", "dokumentasjon"].map((kva) => ({
      kva, sitat: "", mengde: 1, enhet: "stk", kilde: "lead" as const, inkludert: "ja" as const, begrunnelse: null,
    })),
    { kva: "bad", sitat: "", mengde: null, enhet: "stk", kilde: "sjekkliste", inkludert: "nei", begrunnelse: "ikke nevnt" },
  ],
  antakelser: ["Åpne vegger."],
  sporsmal_til_kunden: ["Er inntaket bestilt?"],
};

function raw(poster: number, ikkeFunnet = 0, type: RawTilbudsdata["tilbudstype"] = "punktpris"): RawTilbudsdata {
  return {
    tilbudstype: type,
    typebegrunnelse: "",
    status: "utkast",
    dokument: {
      kunde: { navn: "K", kontakt: null, epost: null, telefon: null, adresse: null },
      tittel: "T",
      seksjoner: [{ tittel: "S", poster: Array.from({ length: poster }, (_, i) => ({ price_item_id: `id${i}`, description: `post ${i}`, quantity: 1 })) }],
    },
    antakelser: [],
    forbehold: [],
    estimat_timer: null,
    epost: { emne: "E", tekst: "T" },
    ikke_funnet: Array.from({ length: ikkeFunnet }, (_, i) => `mangler ${i}`),
    merknader: [],
  };
}

sjekk("Roger-saka: 2 poster for 10 inkluderte arbeidsposter sendes tilbake", omfangSjekk(raw(2), omfang, nybygg).length === 1);
sjekk("6 poster for 10 inkluderte slipper gjennom (minst halvparten, og minst jobbtypens minimum)", omfangSjekk(raw(6), omfang, nybygg).length === 0);
sjekk("3 poster + 3 i ikke_funnet teller som 6", omfangSjekk(raw(3, 3), omfang, nybygg).length === 0);
sjekk("jobbtypens minimum gjelder selv med få arbeidsposter", omfangSjekk(raw(2), { ...omfang, arbeidsposter: omfang.arbeidsposter.slice(0, 2) }, nybygg).length === 1);
sjekk("tid og materiell har ingen poster å telle", omfangSjekk(raw(0, 0, "tid_og_materiell"), omfang, nybygg).length === 0);

const blokk = omfangBlokk(omfang, nybygg);
sjekk("omfangsblokken teller inkluderte og lister postene", /10 arbeidsposter er inkludert/.test(blokk) && /\[nei\] bad/.test(blokk));
sjekk("omfangsblokken tar med spørsmålene", /Er inntaket bestilt\?/.test(blokk));
const avklaring = omfangBlokk({ ...omfang, status: "trenger_avklaring", arbeidsposter: [], sporsmal_til_kunden: [] }, null);
sjekk("trenger_avklaring fra steg 1 når fram til steg 2, med krav om spørsmålstegn", /STATUS: trenger_avklaring/.test(avklaring) && /spørsmålstegn/.test(avklaring) && /formuler ett selv/.test(avklaring));
sjekk("v3 steg 1 sier at alt kunden ber om pris på er «ja»", /uttrykkelig ber om pris på er `ja`/.test(omfangPrompt));
sjekk("v3 steg 2 krever spørsmålstegn i spørsmålene", /med spørsmålstegn/.test(tilbudPrompt));
sjekk("v3: gjetta omfang slår punktpris — tid og materiell blir vurdert først",
  /Er omfanget gjettet\?/.test(tilbudPrompt) && tilbudPrompt.indexOf("Er omfanget gjettet?") < tilbudPrompt.indexOf("finnes alle arbeidspostene som punktposter"));
const elkontroll = pakke.jobbtyper.find((j) => j.id === "elkontroll_utbedring")!;
sjekk("elkontroll_utbedring krev ein rapport — elles er det feilsoking",
  /FORUTSETNING/.test(elkontroll.sjekkliste[0]) && /feilsoking/.test(elkontroll.sjekkliste[0]));

// 4. E-postvaktene ---------------------------------------------------------

const signatur = "Med vennlig hilsen\nKari Nordmann\nDaglig leder\n\n \nStorgata 1\n5000 Bergen\nTlf.:      55 00 00 00  \nwww.eksempel-elektro.no\n";
const epost = `Hei,\n\nTakk for henvendelsen.\n\nMed vennlig hilsen\nKari Nordmann\nDaglig leder\n\nStorgata 1\n5000 Bergen\nTlf.: 55 00 00 00\nwww.eksempel-elektro.no`;
sjekk("nettadressen i firmaets signatur er lov", !harNettadresse(epost, signatur));
sjekk("en annen nettadresse i teksten er ikke lov", harNettadresse(`Se https://tilbud.example/123\n\n${epost}`, signatur));
sjekk("www uten signatur i innstillingene er ikke lov", harNettadresse(epost, null));
sjekk("signaturen godkjennes selv om modellen normaliserte mellomrom og tomme rader", sluttarMedSignatur(epost, signatur));
sjekk("e-post som mangler siste signaturlinje godkjennes ikke", !sluttarMedSignatur(epost.replace("\nwww.eksempel-elektro.no", ""), signatur));
sjekk("tekst etter signaturen godkjennes ikke", !sluttarMedSignatur(`${epost}\n\nPS: ring meg!`, signatur));
sjekk("uten signatur i innstillingene er alt godkjent", sluttarMedSignatur(epost, ""));

// 5. Nullprisvakten -------------------------------------------------------

function prisrad(id: string, navn: string, pris: number): PriceListItem {
  return {
    id, company_id: "c", price_list_id: "p", kind: "punktpris", code: null,
    name: navn, description: null, unit: "stk", unit_price: pris,
    includes_labour: true, includes_material: true, active: true,
  };
}
const prisrader = [prisrad("ok", "Stikkontakt dobbel", 1450), prisrad("null", "Solcelleanlegg", 0)];
const inn = {
  companyId: "c",
  lead: { subject: "S", body_text: "B", from_name: null, from_email: null },
  company: { name: "F", tone_settings: null },
  priceItems: prisrader,
} as unknown as GenerateInput;

function medPoster(...ider: string[]): RawTilbudsdata {
  return {
    ...raw(0),
    dokument: {
      kunde: { navn: "K", kontakt: null, epost: null, telefon: null, adresse: null },
      tittel: "T",
      seksjoner: [{ tittel: "S", poster: ider.map((id) => ({ price_item_id: id, description: `post ${id}`, quantity: 1 })) }],
    },
  };
}

const utan = resolve(medPoster("ok"), inn);
sjekk("ei rad med pris blir ei tilbodslinje", utan.document?.sections[0].lines.length === 1 && utan.unresolved_lines === 0);

const med = resolve(medPoster("ok", "null"), inn);
sjekk("ei rad på 0 kr blir aldri ei tilbodslinje", med.document?.sections[0].lines.length === 1);
sjekk("nullraden hamnar i ikke_funnet i staden", med.ikke_funnet.some((n) => /post null/.test(n)));
sjekk("merknaden namngir prisraden som må fiksast", med.merknader.some((m) => /Solcelleanlegg/.test(m) && /0 kr/.test(m)));
sjekk("nullraden tel som uløyst linje", med.unresolved_lines === 1);

const { prefiks } = buildPrompt(inn);
sjekk("prislista i prompten åtvarar mot nullraden", /Solcelleanlegg[\s\S]*?ADVARSEL/.test(prefiks));
sjekk("rada med pris får inga åtvaring", !/Stikkontakt dobbel\n\s+enhet: stk\n\s+enhetspris_eks_mva: 1450\n\s+ADVARSEL/.test(prefiks));

console.log(feil === 0 ? "\nAlt grønt." : `\n${feil} sjekk(er) feilet.`);
process.exit(feil === 0 ? 0 : 1);
