/**
 * Kjører devello-agent/leads/innkommende/lead-01/02/03 gjennom plattformens
 * generering og rapporterer mot fasiten i leads/LES_MEG.md.
 *
 *   npm run test:agent
 *
 * Krever .env.local med ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL og
 * SUPABASE_SERVICE_ROLE_KEY. Leadene ligger allerede i databasen som manuelle
 * leads (external_message_id test-lead-01/02/03).
 *
 * Etter de tre leadene: bekrefter lead-01 (skriver referanselisten), lager et
 * nytt lead om elbillader i garasje, og viser at referansen ble funnet og lå i
 * prompten.
 */
import { createClient } from "@supabase/supabase-js";
import { generateDraft } from "@/lib/claude/generate";
import {
  findSimilarReferences,
  referencesBlock,
  saveQuoteReference,
} from "@/lib/referanser";
import { activePriceItems } from "@/lib/pricelist/active";
import { computeTotals, type QuoteType } from "@/lib/types";

const STAR = "00000000-0000-0000-0000-000000000001";
const FASIT: Record<string, QuoteType> = {
  "test-lead-01": "punktpris",
  "test-lead-02": "fastpris",
  "test-lead-03": "tid_og_materiell",
};

const NYNORSK_MARKERS = /\b(ikkje|frå|kvar|korleis|venleg|treng|høyrer|dykk|de kan|vere|gjeld|òg|når de)\b/i;
const BOKMAAL_MARKERS = /\b(ikke|hvordan|vennlig|trenger|dere|være|også)\b/i;

function maalformOf(text: string): string {
  const nn = NYNORSK_MARKERS.test(text);
  const nb = BOKMAAL_MARKERS.test(text);
  if (nn && !nb) return "nynorsk";
  if (nb && !nn) return "bokmål";
  if (nn && nb) return "BLANDET";
  return "ubestemt";
}

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`Mangler ${key}. Kjør via «npm run test:agent» så .env.local blir lest.`);
    process.exit(1);
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: company } = await admin
  .from("companies")
  .select("name, tone_settings")
  .eq("id", STAR)
  .single();
const priceItems = await activePriceItems(admin, STAR);
const priceById = new Map(priceItems.map((i) => [i.id, Number(i.unit_price)]));

console.log(`Firma: ${company!.name} · målform: ${company!.tone_settings?.maalform} · ${priceItems.length} prisrader\n`);

async function runLead(externalId: string) {
  const { data: lead } = await admin
    .from("leads")
    .select("*")
    .eq("external_message_id", externalId)
    .single();
  if (!lead) throw new Error(`${externalId} finnes ikke — kjør riggingen på nytt`);

  const leadText = lead.body_text ?? "";
  const { references: similar } = await findSimilarReferences(admin, {
    companyId: STAR,
    leadText: [lead.subject, leadText].filter(Boolean).join("\n\n"),
  });

  const started = Date.now();
  const generated = await generateDraft({
    lead: {
      subject: lead.subject,
      body_text: leadText,
      from_name: lead.from_name,
      from_email: lead.from_email,
    },
    company: { name: company!.name, tone_settings: company!.tone_settings ?? {} },
    priceItems,
    similar,
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  // Rapport
  const fasit = FASIT[externalId];
  const typeOk = fasit ? (generated.quote_type === fasit ? "RIKTIG" : `FEIL (fasit: ${fasit})`) : "-";
  console.log(`════ ${externalId} — ${lead.subject}`);
  console.log(`  type:        ${generated.quote_type} → ${typeOk}  (${seconds}s, status: ${generated.status})`);
  console.log(`  begrunnelse: ${generated.typebegrunnelse}`);
  console.log(`  merknader:   ${generated.merknader.length ? generated.merknader.join(" | ") : "(ingen)"}`);
  if (generated.ikke_funnet.length) console.log(`  ikke_funnet: ${generated.ikke_funnet.join(", ")}`);
  if (generated.estimat_timer) console.log(`  estimat:     ${generated.estimat_timer.fra}–${generated.estimat_timer.til} timer`);

  if (generated.document) {
    let priceOk = true;
    for (const s of generated.document.sections)
      for (const l of s.lines)
        if (priceById.get(l.price_item_id ?? "") !== l.unit_price) priceOk = false;
    const totals = computeTotals(generated.document);
    console.log(`  summer:      ${totals.lines} poster, ${totals.subtotal} eks. mva, ${totals.total} inkl. — priser mot prisfil: ${priceOk ? "STEMMER" : "AVVIK"}`);
  } else {
    console.log(`  dokument:    (ingen — ${generated.quote_type === "tid_og_materiell" ? "satser i e-posten" : "avklaringskladd"})`);
  }
  console.log(`  målform:     ${maalformOf(`${generated.email_body} ${generated.document?.assumptions.join(" ") ?? ""}`)}`);
  console.log(`  e-post:      ${generated.email_body.split("\n")[0]}`);
  console.log("");

  // Lagre som utkast, så det også kan inspiseres i UI-et.
  await admin.from("drafts").upsert(
    {
      lead_id: lead.id,
      quote_type: generated.quote_type,
      typebegrunnelse: generated.typebegrunnelse,
      agent_status: generated.status,
      merknader: generated.merknader,
      ikke_funnet: generated.ikke_funnet,
      estimat_timer: generated.estimat_timer,
      email_subject: generated.email_subject,
      email_body: generated.email_body,
      document: generated.document,
      pdf_path: null,
    },
    { onConflict: "lead_id" },
  );
  await admin.from("leads").update({ status: "utkast_klar" }).eq("id", lead.id);

  return { lead, generated };
}

// 1–3: de tre testleadene
const lead01 = await runLead("test-lead-01");
await runLead("test-lead-02");
await runLead("test-lead-03");

// 4: bekreft lead-01 → referanselisten
console.log("════ Bekrefter lead-01 (skriver referanselisten)");
const { data: draft01 } = await admin
  .from("drafts")
  .select("id")
  .eq("lead_id", lead01.lead.id)
  .single();
// Idempotent re-kjøring: rydd bort raden fra forrige testrunde, ellers vokser
// poolen med en dublett per kjøring og elbillader-søket finner kopier.
await admin.from("quote_references").delete().eq("draft_id", draft01!.id);
await saveQuoteReference(admin, {
  companyId: STAR,
  draftId: draft01!.id,
  leadId: lead01.lead.id,
  quoteType: lead01.generated.quote_type,
  leadText: lead01.lead.body_text ?? "",
  emailSubject: lead01.generated.email_subject,
  emailBody: lead01.generated.email_body,
  document: lead01.generated.document,
  editedByUser: false,
});
const { data: ref } = await admin
  .from("quote_references")
  .select("title, tags, summary")
  .eq("draft_id", draft01!.id)
  .single();
console.log(`  rad: «${ref!.title}»`);
console.log(`  tags: ${(ref!.tags as string[]).join(", ")}`);
console.log(`  summary: ${ref!.summary}\n`);

// 5: nytt lead om elbillader — ble referansen funnet?
console.log("════ Nytt lead: elbillader i garasje");
const elbilText =
  "Hei! Vi har nettopp kjøpt elbil og treng ein ladar montert i garasjen. " +
  "Garasjen står vegg i vegg med huset (enebustad i Førde). Kva kostar det? Helsing Kari Berg";
const { references: found, leadTags } = await findSimilarReferences(admin, {
  companyId: STAR,
  leadText: elbilText,
});
console.log(`  lead-tags: ${leadTags.join(", ")}`);
console.log(`  treff: ${found.length} referanse(r)${found.length ? ` — ${found.map((r) => `«${r.title}»`).join(", ")}` : ""}`);
console.log(`\n  --- referencesBlock slik den står i prompten ---`);
console.log(referencesBlock(found).split("\n").map((l) => `  ${l}`).join("\n"));
