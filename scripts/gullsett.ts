/**
 * Gullsettet — hva agenten foreslo mot hva firmaet faktisk sendte.
 *
 *   npm run gullsett                 mål alle bekreftede tilbud for selskapet
 *   npm run gullsett -- --skriv      skriv i tillegg anonymiserte saker til
 *                                    evaluering/gullsett/ (ikke i git)
 *
 * Dette er den ærligste målingen vi har. Evalueringssuiten (npm run evaluer)
 * dømmer oppdiktede leads mot en fasit vi har skrevet selv; her er fasiten
 * det tilbudet et menneske i firmaet redigerte ferdig og sendte til en ekte
 * kunde. Per tilbud måles:
 *
 *   dekning        andel av de sendte postene agenten hadde med i utkastet
 *   manglet        poster brukeren måtte legge til selv — agentens dyreste feil
 *   fjernet        poster brukeren tok ut — støy, men billig
 *   prisoverstyrt  poster der bare beløpet ble endret. Det er ikke agentens
 *                  feil: prisen kommer fra prisfilen, og en overstyring betyr
 *                  at prisfilen var feil eller manglet raden
 *   avvik          sum i utkastet mot sum sendt, rått
 *   omfangsavvik   samme, men med de SENDTE prisene på postene agenten traff.
 *                  Det isolerer omfanget fra prisfilen: er omfangsavviket
 *                  lite og det rå avviket stort, er det prisfilen som skal
 *                  fikses, ikke agenten
 *
 * Selskapet velges med EVAL_COMPANY_ID i .env.local. Uten den listes
 * selskapene, så ingen måler feil kunde ved et uhell.
 *
 * Krever NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY. Ingen
 * modellkall — dette leser bare det som allerede er lagret.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anonymiser, anonymiserListe } from "@/lib/personvern/anonymiser";
import { maal, type Maaling, type Snapshot } from "@/lib/evaluering/maaling";
import { prisavvik } from "@/lib/opplaering/prisavvik";
import type { QuoteDocument, QuoteType } from "@/lib/types";

const ROT = process.cwd();
const UT = path.join(ROT, "evaluering", "gullsett");

// ---------------------------------------------------------------------------
// Oppsett
// ---------------------------------------------------------------------------

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Mangler ${key}. Kjør via «npm run gullsett» så .env.local blir lest.`);
    process.exit(1);
  }
}

const skriv = process.argv.includes("--skriv");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const companyId = await velgSelskap(admin);

// ---------------------------------------------------------------------------
// Hent
// ---------------------------------------------------------------------------

const { data: leads, error } = await admin
  .from("leads")
  .select("id, subject, body_text, body_preview, from_name, from_email, source, received_at")
  .eq("company_id", companyId)
  .order("received_at", { ascending: true });
if (error) throw new Error(error.message);

const maalinger: Maaling[] = [];
let utenEndeligLogg = 0;

for (const lead of leads ?? []) {
  const { data: draft } = await admin
    .from("drafts")
    .select("id, quote_type, email_subject, email_body, document, confirmed_at, sent_at, motor_versjon")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (!draft?.confirmed_at) continue;

  const { data: versjoner } = await admin
    .from("draft_versions")
    .select("source, version, revisjon, quote_type, email_subject, email_body, document")
    .eq("draft_id", draft.id)
    .order("version", { ascending: true });

  const ai = (versjoner ?? []).find((v) => v.source === "ai") as Snapshot | undefined;
  if (!ai) continue;

  // Den endelige versjonen skal ligge i loggen. Gjør den ikke det (se
  // migrasjon 0030), er drafts-raden det nærmeste vi kommer: bekreft skriver
  // brukerens versjon dit før den logger.
  //
  // Bare versjon 1. En senere versjon er kundens justering, ikke fasiten for
  // henvendelsen agenten fikk.
  const endeligLogget = [...(versjoner ?? [])]
    .reverse()
    .find((v) => v.source === "endelig" && (v.revisjon ?? 1) === 1) as
    | Snapshot
    | undefined;
  if (!endeligLogget) utenEndeligLogg += 1;
  const endelig: Snapshot = endeligLogget ?? {
    quote_type: draft.quote_type as QuoteType,
    email_subject: draft.email_subject,
    email_body: draft.email_body,
    document: draft.document as QuoteDocument | null,
  };

  const m = maal(lead.id, lead.subject ?? "(uten emne)", draft.sent_at, Boolean(endeligLogget), ai, endelig);
  m.motor = (draft.motor_versjon as string | null) ?? "v2";
  maalinger.push(m);

  if (skriv) {
    await skrivSak(lead, ai, endelig, m);
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------

if (maalinger.length === 0) {
  console.log("\nIngen bekreftede tilbud å måle for dette selskapet ennå.\n");
  process.exit(0);
}

console.log(`\n${maalinger.length} bekreftede tilbud\n`);
console.log(
  kolonner(["Tilbud", "Motor", "Poster ai→sendt", "Dekning", "Manglet", "Fjernet", "Pris ov.", "Avvik", "Omfang"]),
);
for (const m of maalinger) {
  console.log(
    kolonner([
      m.emne.slice(0, 44),
      m.motor ?? "v2",
      `${m.aiPoster}→${m.endeligPoster}`,
      pct(m.dekning),
      String(m.manglet.length),
      String(m.fjernet.length),
      String(m.prisoverstyrt.length),
      m.avvikPct === null ? "–" : signert(m.avvikPct),
      m.omfangsavvikPct === null ? "–" : signert(m.omfangsavvikPct),
    ]),
  );
  for (const p of m.manglet) console.log(`      manglet: ${p}`);
  for (const o of m.prisoverstyrt) console.log(`      pris:    ${o.post.slice(0, 60)}  ${o.fra} → ${o.til}`);
}

const n = maalinger.length;
const innenfor = (f: (m: Maaling) => number | null) =>
  maalinger.filter((m) => f(m) !== null && Math.abs(f(m)!) <= 0.2).length;
const snitt = (f: (m: Maaling) => number) => maalinger.reduce((s, m) => s + f(m), 0) / n;

console.log("\nSamlet");
console.log(`  innenfor ±20 % av sendt sum, rått ............ ${innenfor((m) => m.avvikPct)} av ${n}`);
console.log(`  innenfor ±20 % med sendte priser (omfang) .... ${innenfor((m) => m.omfangsavvikPct)} av ${n}`);
console.log(`  gjennomsnittlig dekning ...................... ${pct(snitt((m) => m.dekning))}`);
console.log(`  poster agenten manglet, totalt ............... ${maalinger.reduce((s, m) => s + m.manglet.length, 0)}`);
console.log(`  poster brukeren fjernet, totalt .............. ${maalinger.reduce((s, m) => s + m.fjernet.length, 0)}`);
console.log(`  prisoverstyringer, totalt .................... ${maalinger.reduce((s, m) => s + m.prisoverstyrt.length, 0)}`);

// Rettingene på tvers av tilbud. Én overstyring er en avgjørelse; den samme
// overstyringen tre ganger er en gal prisrad.
const forslag = prisavvik(maalinger);
if (forslag.length > 0) {
  console.log("\nPrisrader firmaet retter selv");
  for (const f of forslag) {
    const merke = f.tillit === "enige" ? "→" : f.tillit === "sprikende" ? "?" : " ";
    console.log(`  ${merke} ${f.tekst}`);
  }
  const enige = forslag.filter((f) => f.tillit === "enige").length;
  if (enige > 0) {
    console.log(`\n  ${enige} rad(er) kan rettes i prisfila med én gang. Det fjerner ${
      forslag.filter((f) => f.tillit === "enige").reduce((sum, f) => sum + f.antall, 0)
    } av ${maalinger.reduce((s, m) => s + m.prisoverstyrt.length, 0)} overstyringer.`);
  }
}

if (utenEndeligLogg > 0) {
  console.log(
    `\n  ⚠ ${utenEndeligLogg} av ${n} tilbud mangler «endelig»-versjon i draft_versions. ` +
      `Målt mot drafts-raden i stedet. Kjør migrasjon 0030 — se supabase/migrations/0030_endelig_versjon.sql.`,
  );
}
if (skriv) console.log(`\nSaker skrevet til evaluering/gullsett/ (${n} filer, ikke i git).`);
console.log();

// ---------------------------------------------------------------------------
// Saker til disk — anonymisert, utenfor git
// ---------------------------------------------------------------------------

/**
 * Én JSON-fil per tilbud: leadet slik det kom inn, agentens poster og de
 * sendte postene. Navn, e-post, telefon og adresse byttes ut før noe skrives
 * — samme regel som for referanselisten. Repoet er offentlig; kundens kunder
 * skal aldri ligge i det, og mappen står derfor også i .gitignore.
 */
async function skrivSak(
  lead: {
    id: string;
    subject: string | null;
    body_text: string | null;
    body_preview: string | null;
    from_name: string | null;
    from_email: string | null;
    source: string | null;
  },
  ai: Snapshot,
  endelig: Snapshot,
  m: Maaling,
) {
  const kunde = endelig.document?.customer ?? ai.document?.customer;
  const kjente = {
    navn: kunde?.name ?? lead.from_name,
    kontakt: kunde?.contact,
    epost: kunde?.email ?? lead.from_email,
    telefon: kunde?.phone,
    adresse: kunde?.address,
  };
  const skjul = (t: string | null | undefined) => anonymiser(t, kjente);
  const poster = (doc: QuoteDocument | null) =>
    doc
      ? doc.sections.map((s) => ({
          seksjon: s.title,
          poster: s.lines.map((l) => ({
            price_item_id: l.price_item_id,
            beskrivelse: skjul(l.description),
            antall: l.quantity,
            enhet: l.unit,
            enhetspris: l.unit_price,
          })),
        }))
      : null;

  await mkdir(UT, { recursive: true });
  await writeFile(
    path.join(UT, `${lead.id}.json`),
    JSON.stringify(
      {
        lead: {
          kilde: lead.source,
          emne: skjul(lead.subject),
          tekst: skjul(lead.body_text || lead.body_preview),
        },
        agent: {
          tilbudstype: ai.quote_type,
          seksjoner: poster(ai.document),
          forutsetninger: anonymiserListe(ai.document?.assumptions ?? [], kjente),
          sum_eks_mva: m.aiSum,
        },
        sendt: {
          tilbudstype: endelig.quote_type,
          seksjoner: poster(endelig.document),
          forutsetninger: anonymiserListe(endelig.document?.assumptions ?? [], kjente),
          sum_eks_mva: m.endeligSum,
          fra_versjonslogg: m.endeligFraLogg,
        },
        maaling: {
          dekning: m.dekning,
          manglet: m.manglet.map((p) => skjul(p)),
          fjernet: m.fjernet.map((p) => skjul(p)),
          prisoverstyrt: m.prisoverstyrt.map((o) => ({ ...o, post: skjul(o.post) })),
          avvik_pct: m.avvikPct,
          omfangsavvik_pct: m.omfangsavvikPct,
        },
      },
      null,
      2,
    ) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------------

async function velgSelskap(admin: SupabaseClient): Promise<string> {
  const valgt = process.env.EVAL_COMPANY_ID;
  if (valgt) return valgt;

  const { data } = await admin.from("companies").select("id, name, created_at").order("created_at");
  console.error("\nSett EVAL_COMPANY_ID i .env.local til selskapet som skal måles:\n");
  for (const c of data ?? []) console.error(`  ${c.id}  ${c.name}  (${String(c.created_at).slice(0, 10)})`);
  console.error();
  process.exit(1);
}

function kolonner(felt: string[]): string {
  const bredder = [46, 7, 16, 9, 8, 8, 9, 8, 8];
  return felt.map((f, i) => (i === 0 ? f.padEnd(bredder[i]) : f.padStart(bredder[i]))).join("");
}

function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

function signert(x: number): string {
  const p = Math.round(x * 100);
  return `${p > 0 ? "+" : ""}${p} %`;
}
