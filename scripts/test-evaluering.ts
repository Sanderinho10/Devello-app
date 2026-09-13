/**
 * Evaluering av tilbudsagenten.
 *
 *   npm run evaluer                 alle saker
 *   npm run evaluer -- 05 09        bare disse sakene
 *   npm run evaluer -- --baseline   skriv resultatet som ny baseline
 *   npm run evaluer -- --kaldstart  som over, men uten referanser i konteksten:
 *                                   slik en ny kunde uten historikk ser agenten
 *   npm run evaluer -- --motor v3   kjør en bestemt motor (v2 eller v3) i stedet
 *                                   for den selskapet har valgt. Egen baseline
 *                                   per motor, så v2 og v3 kan sammenlignes.
 *
 * Forskjellen fra test:agent er at denne DØMMER. test:agent skriver ut hva
 * agenten svarte og lar et menneske vurdere det; her har hver sak en fasit,
 * hver sjekk er enten grønn eller rød, og exit-koden er 1 hvis noe ryker.
 * Det er det som gjør den brukbar før en utrulling: du ser om endringen din
 * gjorde noe bedre eller verre, ikke bare hva den gjorde.
 *
 * Sakene ligger i evaluering/saker/. Én fil per sak, fasiten i toppen.
 * Legg til en sak hver gang agenten bommer i produksjon — da kan den samme
 * feilen aldri komme tilbake ubemerket.
 *
 * Selskapet velges med EVAL_COMPANY_ID i .env.local — prisfilen, referansene
 * og målformen er selskapets. Uten den listes selskapene og kjøringen stopper,
 * så ingen evaluerer demo-selskapet i den tro at det er piloten.
 *
 * Krever .env.local med ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL og
 * SUPABASE_SERVICE_ROLE_KEY. Kjøringen koster ~1 generering per sak.
 */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateDraft, harNettadresse, sluttarMedSignatur, type GeneratedDraft } from "@/lib/claude/generate";
import { erMotorVersjon, fagFor, motorFor } from "@/lib/claude/motor-versjon";
import { findSimilarReferences } from "@/lib/referanser";
import { forbeholdsBibliotek } from "@/lib/referanser/forbehold";
import { activePriceItems } from "@/lib/pricelist/active";
import { computeTotals, type PriceListItem, type QuoteType } from "@/lib/types";

const ROT = process.cwd();
const SAKER = path.join(ROT, "evaluering", "saker");
const RESULTAT = path.join(ROT, "evaluering", "resultat");

// ---------------------------------------------------------------------------
// Saksformat
// ---------------------------------------------------------------------------

/**
 * Fasiten. Alt er valgfritt: en sak sjekker bare det den har satt. Det er med
 * vilje — å gjette et sumspenn man ikke vet, gir en test som feiler på riktig
 * oppførsel, og en test man ikke stoler på blir slått av.
 */
interface Fasit {
  id: string;
  navn: string;
  kilde?: string;
  type?: QuoteType;
  status?: "utkast" | "trenger_avklaring";
  dokument?: "ja" | "nei";
  poster_min?: number;
  poster_maks?: number;
  seksjonar_min?: number;
  sum_min?: number;
  sum_maks?: number;
  /** «firma» = målformen i selskapets innstillinger; ellers nynorsk/bokmål. */
  maalform?: string;
  adresse?: string; // «null» = skal være null, ellers delstreng
  kontakt_sett?: boolean;
  estimat_timer?: boolean;
  ikke_funnet_tom?: boolean;
  ikke_funnet_inneheld?: string[];
  merknad_inneheld?: string[];
  epost_inneheld?: string[];
}

interface Sak {
  fasit: Fasit;
  lead: {
    subject: string;
    body_text: string;
    from_name: string | null;
    from_email: string | null;
  };
}

/** Liten YAML-delmengde: `nøkkel: verdi` og `nøkkel: [a, b]`. Ingen avhengighet. */
function parseFrontmatter(text: string): Record<string, string | string[]> {
  const ut: Record<string, string | string[]> = {};
  for (const linje of text.split("\n")) {
    const treff = linje.match(/^([a-zæøå_]+):\s*(.*)$/i);
    if (!treff) continue;
    const [, nøkkel, rå] = treff;
    const verdi = rå.trim();
    if (verdi.startsWith("[")) {
      ut[nøkkel] = verdi
        .slice(1, -1)
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);
    } else {
      ut[nøkkel] = verdi;
    }
  }
  return ut;
}

/**
 * Leadfilene i devello-agent/leads/innkommende/ har sitt eget format, og det
 * skal de fortsette å ha — de brukes til manuell testing i Cowork. Her leses
 * de som de er, så det finnes én kopi av hvert lead og ikke to som kan drive
 * fra hverandre.
 */
function parseLeadfil(text: string) {
  const emne = text.match(/^#\s*Lead:\s*(.+)$/m)?.[1]?.trim() ?? "(uten emne)";
  const fra = text.match(/^\*\*Fra:\*\*\s*(.+)$/m)?.[1] ?? "";
  const [navn, epost] = fra.split("·").map((d) => d.trim());
  const skille = text.indexOf("\n---\n");
  const body = skille >= 0 ? text.slice(skille + 5).trim() : text;
  return {
    subject: emne,
    body_text: body,
    from_name: navn || null,
    from_email: epost || null,
  };
}

/**
 * Sakene og leadfilene leses som LF uansett hva git sjekket dem ut som. Git
 * for Windows gir CRLF som standard, og da treffer verken `---\n`-blokka eller
 * `nøkkel: verdi`-linjene — fasiten blir tom og suiten måler ingenting.
 */
async function lesTekst(filsti: string): Promise<string> {
  return (await readFile(filsti, "utf8")).replace(/\r\n/g, "\n");
}

async function lesSaker(filter: string[]): Promise<Sak[]> {
  const filer = (await readdir(SAKER)).filter((f) => f.endsWith(".md")).sort();
  const saker: Sak[] = [];

  for (const fil of filer) {
    const rå = await lesTekst(path.join(SAKER, fil));
    const treff = rå.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!treff) throw new Error(`${fil} mangler fasit-blokk øverst`);

    const felt = parseFrontmatter(treff[1]);
    const fasit = {
      ...felt,
      poster_min: num(felt.poster_min),
      poster_maks: num(felt.poster_maks),
      seksjonar_min: num(felt.seksjonar_min),
      sum_min: num(felt.sum_min),
      sum_maks: num(felt.sum_maks),
      kontakt_sett: bool(felt.kontakt_sett),
      estimat_timer: bool(felt.estimat_timer),
      ikke_funnet_tom: bool(felt.ikke_funnet_tom),
    } as unknown as Fasit;

    if (filter.length && !filter.includes(fasit.id)) continue;

    const lead = fasit.kilde
      ? parseLeadfil(await lesTekst(path.join(ROT, fasit.kilde)))
      : parseInlineLead(treff[2]);

    saker.push({ fasit, lead });
  }

  if (filter.length && saker.length === 0) {
    throw new Error(`Fant ingen saker som matcher ${filter.join(", ")}`);
  }
  return saker;
}

/** Innebygd lead: «Emne:»- og «Fra:»-linje, så tom linje, så brødteksten. */
function parseInlineLead(text: string) {
  const emne = text.match(/^Emne:\s*(.+)$/m)?.[1]?.trim() ?? "(uten emne)";
  const fra = text.match(/^Fra:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const epost = fra.match(/<([^>]+)>/)?.[1] ?? null;
  const navn = fra.replace(/<[^>]*>/, "").trim() || null;
  const body = text.split(/\n\s*\n/).slice(1).join("\n\n").trim();
  return { subject: emne, body_text: body, from_name: navn, from_email: epost };
}

const num = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : undefined);
const bool = (v: unknown) => (v === undefined ? undefined : v === "true");

// ---------------------------------------------------------------------------
// Sjekkene
// ---------------------------------------------------------------------------

/**
 * Speiler PLACEHOLDER_PATTERNS i generate.ts. Duplisert med vilje: testen skal
 * dømme det som faktisk kom ut, ikke stole på at valideringen kjørte.
 */
const PLASSHOLDARAR: { pattern: RegExp; label: string }[] = [
  { pattern: /<[a-zæøåA-ZÆØÅ_ -]{2,30}>/, label: "«<…>»-plassholder" },
  { pattern: /\[[a-zæøåA-ZÆØÅ_ -]{2,30}\]/, label: "«[…]»-plassholder" },
  { pattern: /\b[XY]\s*(timer|timar|tima|stk|m²)\b/, label: "«X timer»-plassholder" },
];

const NYNORSK = /\b(ikkje|frå|kvar|korleis|venleg|treng|høyrer|dykk|vere|gjeld|òg)\b/i;
const BOKMAAL = /\b(ikke|hvordan|vennlig|trenger|dere|være|også)\b/i;

function maalformAv(text: string): string {
  const nn = NYNORSK.test(text);
  const nb = BOKMAAL.test(text);
  if (nn && !nb) return "nynorsk";
  if (nb && !nn) return "bokmål";
  if (nn && nb) return "BLANDET";
  return "ubestemt";
}

interface Kontekst {
  priceById: Map<string, PriceListItem>;
  maalform: string;
  signatur: string | null;
  /** Har firmaet både materiell- og timeprisliste? Utan dei finst ikkje fastpris. */
  harFastprisLister: boolean;
  /** Har firmaet referansar av typen tid og materiell? Utan dei gir motoren ikkje timespenn. */
  harTmReferansar: boolean;
}

/** Gjelder hver eneste sak, uansett fasit. Dette er gulvet. */
function universelleSjekkar(g: GeneratedDraft, k: Kontekst): string[] {
  const feil: string[] = [];

  if (g.unresolved_lines > 0) {
    feil.push(`${g.unresolved_lines} post(ar) peika på ukjend prisrad`);
  }

  const tekstar: [string, string][] = [
    ["epost.emne", g.email_subject],
    ["epost.tekst", g.email_body],
  ];
  if (g.document) {
    tekstar.push(["tittel", g.document.title]);
    g.document.assumptions.forEach((a, i) => tekstar.push([`forutsetning[${i}]`, a]));
    for (const s of g.document.sections) {
      for (const l of s.lines) tekstar.push([`post «${l.description}»`, l.description]);
    }
  }

  for (const [felt, tekst] of tekstar) {
    for (const { pattern, label } of PLASSHOLDARAR) {
      if (pattern.test(tekst)) feil.push(`${felt} inneheld ${label}`);
    }
  }

  // Same dommar som valideringa i generate.ts: firmaets eiga nettadresse i
  // signaturen er lov, alt anna er feil.
  if (harNettadresse(g.email_body, k.signatur)) {
    feil.push("e-postteksten inneheld ei nettadresse utanom signaturen");
  }

  // Prisane høyrer heime i PDF-en. Unntaket er tid og materiell, der satsane
  // ER prisen og skal stå i teksten.
  if (g.quote_type !== "tid_og_materiell" && /\d[\d\s.,]*\s*(kr\b|,-|NOK)/i.test(g.email_body)) {
    feil.push("e-postteksten inneheld eit beløp (prisane skal stå i PDF-en)");
  }

  // Whitespace-tolerant: Outlook-signaturar har rader med berre mellomrom og
  // kolonnar justerte med mange mellomrom, og modellen normaliserer dei.
  if (!sluttarMedSignatur(g.email_body, k.signatur)) {
    feil.push("e-postteksten sluttar ikkje med signaturen frå innstillingane");
  }

  const målt = maalformAv(`${g.email_body} ${g.document?.assumptions.join(" ") ?? ""}`);
  if (k.maalform && målt !== "ubestemt" && målt !== k.maalform) {
    feil.push(`målform er ${målt}, firmaet har ${k.maalform}`);
  }

  // Pengane. Modellen peikar på ein prisrad; her sjekkar vi at det som kom ut
  // faktisk er prisen frå fila, og at summane er rekna av dei same tala.
  if (g.document) {
    let manuellSum = 0;
    for (const s of g.document.sections) {
      for (const l of s.lines) {
        const rad = k.priceById.get(l.price_item_id ?? "");
        if (!rad) {
          feil.push(`«${l.description}» peikar på ein prisrad som ikkje finst`);
          continue;
        }
        if (Number(rad.unit_price) !== l.unit_price) {
          feil.push(`«${l.description}» har pris ${l.unit_price}, prisfila seier ${rad.unit_price}`);
        }
        if (rad.unit !== l.unit) {
          feil.push(`«${l.description}» har eining ${l.unit}, prisfila seier ${rad.unit}`);
        }
        if (!(l.quantity > 0)) feil.push(`«${l.description}» har antal ${l.quantity}`);
        manuellSum += l.quantity * l.unit_price;
      }
    }
    const totals = computeTotals(g.document);
    if (Math.abs(manuellSum - totals.subtotal) > 0.5) {
      feil.push(`sum eks. mva er ${totals.subtotal}, postane summerer til ${manuellSum}`);
    }
  }

  return feil;
}

function fasitSjekkar(g: GeneratedDraft, f: Fasit, k: Kontekst): string[] {
  const feil: string[] = [];
  const totals = g.document ? computeTotals(g.document) : null;
  const postar = g.document
    ? g.document.sections.reduce((n, s) => n + s.lines.length, 0)
    : 0;

  // Fastpris blir bygd av materiellista + timeprislista. Har firmaet berre
  // punktprisliste (Star Elektro), kan motoren ikkje lage eit fastpris-dokument
  // — då er punktpris det rette svaret på ei fastpris-sak, og seksjonskravet
  // (materiell + arbeid kvar for seg) gjeld ikkje.
  const fastprisUmogleg = f.type === "fastpris" && !k.harFastprisLister;
  const ventaType = fastprisUmogleg ? "punktpris" : f.type;
  if (ventaType && g.quote_type !== ventaType) {
    feil.push(`type ${g.quote_type}, fasit ${ventaType}${fastprisUmogleg ? " (fastpris utan materiell-/timeprisliste)" : ""}`);
  }
  if (f.status && g.status !== f.status) feil.push(`status ${g.status}, fasit ${f.status}`);
  if (f.dokument === "ja" && !g.document) feil.push("manglar dokument");
  if (f.dokument === "nei" && g.document) feil.push("skulle ikkje hatt dokument");

  if (f.poster_min !== undefined && postar < f.poster_min) {
    feil.push(`${postar} postar, fasit minst ${f.poster_min}`);
  }
  if (f.poster_maks !== undefined && postar > f.poster_maks) {
    feil.push(`${postar} postar, fasit høgst ${f.poster_maks}`);
  }
  if (!fastprisUmogleg && f.seksjonar_min !== undefined && (g.document?.sections.length ?? 0) < f.seksjonar_min) {
    feil.push(`${g.document?.sections.length ?? 0} seksjonar, fasit minst ${f.seksjonar_min}`);
  }
  if (f.sum_min !== undefined && (totals?.subtotal ?? 0) < f.sum_min) {
    feil.push(`sum ${totals?.subtotal ?? 0}, fasit minst ${f.sum_min}`);
  }
  if (f.sum_maks !== undefined && (totals?.subtotal ?? 0) > f.sum_maks) {
    feil.push(`sum ${totals?.subtotal ?? 0}, fasit høgst ${f.sum_maks}`);
  }

  const venta = f.maalform === "firma" ? k.maalform : f.maalform;
  if (venta) {
    const målt = maalformAv(g.email_body);
    if (målt !== venta) feil.push(`målform ${målt}, fasit ${venta}`);
  }

  if (f.adresse !== undefined) {
    const adr = g.document?.customer.address ?? null;
    if (f.adresse === "null" && adr !== null) {
      feil.push(`adresse «${adr}», fasit null (ukjend adresse skal ikkje gjettast)`);
    } else if (f.adresse !== "null" && !(adr ?? "").toLowerCase().includes(f.adresse.toLowerCase())) {
      feil.push(`adresse «${adr}», fasit inneheld «${f.adresse}»`);
    }
  }

  if (f.kontakt_sett !== undefined) {
    const har = Boolean(g.document?.customer.contact);
    if (har !== f.kontakt_sett) feil.push(`kontaktperson ${har ? "sett" : "ikkje sett"}, fasit motsett`);
  }

  // Timespennet skal berre setjast «når referansane gir dekning» (skjemaet i
  // generate.ts). Har firmaet ingen tid-og-materiell-referansar, er null det
  // rette svaret — det er normtider (steg 1 i planen) som skal fjerne dette
  // atterhaldet, ikkje ei slakkare prøve.
  if (f.estimat_timer !== undefined && !(f.estimat_timer && !k.harTmReferansar)) {
    const har = Boolean(g.estimat_timer);
    if (har !== f.estimat_timer) feil.push(`estimat_timer ${har ? "sett" : "mangler"}, fasit motsett`);
  }

  if (f.ikke_funnet_tom && g.ikke_funnet.length > 0) {
    feil.push(`ikke_funnet skulle vore tom: ${g.ikke_funnet.join(", ")}`);
  }
  for (const ord of f.ikke_funnet_inneheld ?? []) {
    if (!g.ikke_funnet.join(" ").toLowerCase().includes(ord.toLowerCase())) {
      feil.push(`ikke_funnet manglar «${ord}» (fann: ${g.ikke_funnet.join(", ") || "ingenting"})`);
    }
  }
  for (const ord of f.merknad_inneheld ?? []) {
    if (!g.merknader.join(" ").toLowerCase().includes(ord.toLowerCase())) {
      feil.push(`merknader manglar «${ord}»`);
    }
  }
  for (const ord of f.epost_inneheld ?? []) {
    if (!g.email_body.toLowerCase().includes(ord.toLowerCase())) {
      feil.push(`e-postteksten manglar «${ord}»`);
    }
  }

  return feil;
}

// ---------------------------------------------------------------------------
// Kjøring
// ---------------------------------------------------------------------------

/**
 * Før noe kjøres: er grunnlaget på plass? Roger sitt førsteutkast på 2 postar
 * og 4 098 kr kom ikke av en dårlig prompt — referansepoolen var tom fordi 14
 * skanna PDF-er aldri var lest. En evaluering mot tomt grunnlag måler ingenting
 * og lurer den som leser tallet.
 */
async function sjekkGrunnlag(admin: SupabaseClient, companyId: string, priceItems: PriceListItem[]) {
  const feil: string[] = [];

  if (priceItems.length === 0) feil.push("prisfila er tom — agenten kan ikkje prise noko");

  const { count } = await admin
    .from("quote_references")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);
  if (!count) {
    feil.push(
      "referansepoolen er tom — agenten flyg blindt. Les inn referansefilene (Referansefiler → «Les filene») før du evaluerer.",
    );
  }

  if (feil.length) {
    console.error("\nGrunnlaget manglar:\n" + feil.map((f) => `  ✗ ${f}`).join("\n") + "\n");
    process.exit(1);
  }

  const { count: tm } = await admin
    .from("quote_references")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("quote_type", "tid_og_materiell");

  return { referansar: count ?? 0, tmReferansar: tm ?? 0 };
}

async function velgSelskap(admin: SupabaseClient): Promise<string> {
  const valgt = process.env.EVAL_COMPANY_ID;
  if (valgt) return valgt;

  const { data } = await admin.from("companies").select("id, name, created_at").order("created_at");
  console.error("\nSett EVAL_COMPANY_ID i .env.local til selskapet som skal evaluerast:\n");
  for (const c of data ?? []) console.error(`  ${c.id}  ${c.name}  (${String(c.created_at).slice(0, 10)})`);
  console.error();
  process.exit(1);
}

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`Mangler ${key}. Kjør via «npm run evaluer» så .env.local blir lest.`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const skrivBaseline = args.includes("--baseline");
const kaldstart = args.includes("--kaldstart");
const motorArg = args[args.indexOf("--motor") + 1];
if (args.includes("--motor") && !erMotorVersjon(motorArg)) {
  console.error("--motor må vere v2 eller v3");
  process.exit(1);
}
// Filteret er saks-id-ar; verdien etter --motor er ikkje ei sak.
const filter = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--motor");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const STAR = await velgSelskap(admin);

const { data: company } = await admin
  .from("companies")
  .select("name, tone_settings, motor_versjon, fag")
  .eq("id", STAR)
  .single();
if (!company) {
  console.error(`Fant ikkje selskapet ${STAR}. Sjekk EVAL_COMPANY_ID.`);
  process.exit(1);
}

const priceItems = await activePriceItems(admin, STAR);
const { referansar, tmReferansar } = await sjekkGrunnlag(admin, STAR, priceItems);
const forbehold = await forbeholdsBibliotek(admin, STAR);

const tone = (company!.tone_settings ?? {}) as Record<string, unknown>;
const kontekst: Kontekst = {
  priceById: new Map(priceItems.map((i) => [i.id, i])),
  maalform:
    tone.maalform === "nn" ? "nynorsk" : tone.maalform === "nb" ? "bokmål" : "",
  signatur: typeof tone.signatur === "string" ? tone.signatur : null,
  harFastprisLister:
    priceItems.some((i) => i.kind === "materiell") && priceItems.some((i) => i.kind === "time"),
  harTmReferansar: tmReferansar > 0,
};

const saker = await lesSaker(filter);

// Motoren: --motor foran selskapets valg foran standarden.
const motor = erMotorVersjon(motorArg) ? motorArg : motorFor(company);
const fag = fagFor(company);

console.log(
  `\n${company!.name} · motor ${motor} · ${priceItems.length} prisrader · ${referansar} referansar · ` +
    `${forbehold.length} forbehold · ${saker.length} saker` +
    (kontekst.harFastprisLister ? "" : " · berre punktprisliste (fastpris-saker ventar punktpris)") +
    (kontekst.harTmReferansar ? "" : " · ingen tid-og-materiell-referansar (timespenn blir ikkje kravd)") +
    (kaldstart ? " · KALDSTART (ingen referansar i konteksten)" : "") +
    "\n",
);

const resultat: Record<string, { navn: string; feil: string[] }> = {};

// Kvar motor og kvar modus (full kontekst / kaldstart) har si eiga baseline —
// det er samanlikninga mellom dei som er poenget. v2 utan suffiks, så gamle
// baseline-filer framleis gjeld.
const suffiks = `${motor === "v2" ? "" : `-${motor}`}${kaldstart ? "-kaldstart" : ""}`;

// Sjølve utkasta blir skrivne til disk, eitt per sak, så ei raud linje kan
// lesast i samanheng: kva agenten faktisk svarte, ikkje berre kva sjekken sa.
// Ikkje i git — dei inneheld firmaets prisar og signatur.
const UTKAST = path.join(RESULTAT, `utkast${suffiks}`);
await mkdir(UTKAST, { recursive: true });

for (const sak of saker) {
  const start = Date.now();
  let feil: string[] = [];

  try {
    // Kaldstart: same prisfil og same forbehold, men ingen referansar — det
    // er nøyaktig det ein ny kunde utan historikk får. Forskjellen mellom
    // dei to køyringane er verdien av referanselista.
    const { references: similar } = kaldstart
      ? { references: [] }
      : await findSimilarReferences(admin, {
          companyId: STAR,
          leadText: [sak.lead.subject, sak.lead.body_text].filter(Boolean).join("\n\n"),
        });

    const generert = await generateDraft({
      companyId: STAR,
      leadId: null,
      lead: sak.lead,
      company: { name: company!.name, tone_settings: company!.tone_settings ?? {} },
      priceItems,
      similar,
      forbehold,
      motor,
      fag,
    });

    await writeFile(path.join(UTKAST, `${sak.fasit.id}.json`), JSON.stringify(generert, null, 2) + "\n");
    feil = [...universelleSjekkar(generert, kontekst), ...fasitSjekkar(generert, sak.fasit, kontekst)];
  } catch (e) {
    // En generering som kaster er en feil på lik linje med et galt svar —
    // valideringen i generate.ts ga opp etter to forsøk.
    feil = [`generering feila: ${(e as Error).message}`];
  }

  const sek = ((Date.now() - start) / 1000).toFixed(0);
  const merke = feil.length === 0 ? "✓" : "✗";
  console.log(`${merke} ${sak.fasit.id}  ${sak.fasit.navn}  (${sek}s)`);
  for (const f of feil) console.log(`     ${f}`);

  resultat[sak.fasit.id] = { navn: sak.fasit.navn, feil };
}

// ---------------------------------------------------------------------------
// Dom, og sammenligning med forrige kjøring
// ---------------------------------------------------------------------------

const bestått = Object.values(resultat).filter((r) => r.feil.length === 0).length;
console.log(`\n${bestått} av ${saker.length} saker bestått`);

const baselinePath = path.join(RESULTAT, `baseline${suffiks}.json`);
const sistePath = path.join(RESULTAT, `siste${suffiks}.json`);

let baseline: Record<string, { navn: string; feil: string[] }> | null = null;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  /* første kjøring */
}

let regresjonar = 0;
if (baseline && !skrivBaseline) {
  const nye: string[] = [];
  const fiksa: string[] = [];
  for (const [id, r] of Object.entries(resultat)) {
    const før = baseline[id];
    if (!før) continue;
    if (før.feil.length === 0 && r.feil.length > 0) nye.push(`${id} ${r.navn}`);
    if (før.feil.length > 0 && r.feil.length === 0) fiksa.push(`${id} ${r.navn}`);
  }
  regresjonar = nye.length;
  if (fiksa.length) console.log(`\nFiksa sidan baseline:\n${fiksa.map((s) => `  + ${s}`).join("\n")}`);
  if (nye.length) console.log(`\nNYE FEIL sidan baseline:\n${nye.map((s) => `  - ${s}`).join("\n")}`);
  if (!fiksa.length && !nye.length) console.log("\nIngen endring sidan baseline.");
}

await writeFile(sistePath, JSON.stringify(resultat, null, 2) + "\n");

// Ei køyring der genereringa kasta (tom kreditt, nettverk nede) måler ikkje
// agenten, og skal ikkje bli baseline — elles blir neste ekte køyring
// samanlikna med 0/15 og alt ser «fiksa» ut.
const infrastrukturfeil = Object.values(resultat).filter((r) => r.feil.some((f) => f.startsWith("generering feila:"))).length;
if (skrivBaseline && infrastrukturfeil > 0) {
  console.log(`\nBaseline IKKJE skriven: ${infrastrukturfeil} sak(er) feila før agenten svarte. Køyr på nytt med --baseline når alt går gjennom.`);
} else if (skrivBaseline) {
  await writeFile(baselinePath, JSON.stringify(resultat, null, 2) + "\n");
  console.log(`\nBaseline skriven (${bestått}/${saker.length}).`);
}
console.log(`Utkasta ligg i evaluering/resultat/utkast${suffiks}/<id>.json`);

// Filter-kjøringer skal ikke kunne «bestå» hele suiten. De er for feilsøking.
if (filter.length) process.exit(0);
process.exit(bestått === saker.length && regresjonar === 0 ? 0 : 1);
