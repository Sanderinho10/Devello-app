import type { SupabaseClient } from "@supabase/supabase-js";
import { generateDraft } from "@/lib/claude/generate";
import { activePriceItems } from "@/lib/pricelist/active";
import { logDraftVersion } from "@/lib/drafts/versions";
import { assessConfidence, countUnresolvedLines } from "@/lib/drafts/confidence";
import { aktiveLaerdommer } from "@/lib/laering/lessons";
import { findSimilarReferences } from "@/lib/referanser";
import type { QuoteDocument, QuoteType } from "@/lib/types";

/**
 * Genereringen, løsrevet fra HTTP-laget.
 *
 * Den kalles to steder: fra /api/drafts/generate når brukeren trykker
 * «Generer utkast» og venter på svaret, og fra bakgrunnen etter at en manuell
 * henvendelse er lagret. Samme kode begge veier — et utkast skal ikke bli
 * annerledes av hvem som ba om det.
 */
export async function generateForLead(
  admin: SupabaseClient,
  opts: {
    leadId: string;
    companyId: string;
    userId: string | null;
    quoteType?: QuoteType | null;
    /** Tvinger nytt modellkall selv om vi har en lagret versjon. */
    force?: boolean;
  },
): Promise<{ leadId: string; draft: unknown; reused: boolean }> {
  const { data: lead } = await admin
    .from("leads")
    .select("*")
    .eq("id", opts.leadId)
    .eq("company_id", opts.companyId)
    .maybeSingle();

  if (!lead) throw new Error("Fant ikke leadet");

  // Har vi generert denne typen for dette leadet før, bruker vi den lagrede
  // versjonen. Å bytte fram og tilbake på type-bryteren skal ikke koste et
  // modellkall per klikk.
  if (opts.quoteType && !opts.force) {
    const stored = await reuseStoredVersion(
      admin,
      lead.id,
      opts.quoteType,
      opts.companyId,
    );
    if (stored) {
      await settStatus(admin, lead.id, lead.status);
      return { leadId: lead.id, draft: stored, reused: true };
    }
  }

  const [{ data: company }, { data: references }, priceItems, lessons] = await Promise.all([
    admin
      .from("companies")
      .select("name, tone_settings")
      .eq("id", opts.companyId)
      .single(),
    admin.from("reference_quotes").select("type").eq("company_id", opts.companyId),
    activePriceItems(admin, opts.companyId),
    // Bare dette selskapets lærdommer. Aldri på tvers av kunder.
    aktiveLaerdommer(admin, opts.companyId),
  ]);

  const leadText = lead.body_text || lead.body_preview || "";

  // Referanselisten: de 3–5 mest relevante tidligere bekreftede tilbudene,
  // funnet via nøkkelord fra leadet. Tenant-ID kommer fra sesjonen, aldri fra
  // modellen.
  const { references: similar } = await findSimilarReferences(admin, {
    companyId: opts.companyId,
    leadText: [lead.subject, leadText].filter(Boolean).join("\n\n"),
    quoteType: opts.quoteType ?? null,
  });

  // Ett kall: agenten velger type og leverer utkastet i samme tur. Har
  // brukeren valgt type fra bryteren, sendes den inn som lås.
  const generated = await generateDraft({
    lockedType: opts.quoteType ?? null,
    lead: {
      subject: lead.subject,
      body_text: leadText,
      from_name: lead.from_name,
      from_email: lead.from_email,
    },
    company: {
      name: company!.name,
      tone_settings: company!.tone_settings ?? {},
    },
    priceItems,
    similar,
    lessons,
  });

  const quoteType = generated.quote_type;

  const confidence = assessConfidence({
    quoteType,
    references: references ?? [],
    priceItems,
    document: generated.document,
    unresolvedLines: generated.unresolved_lines,
  });

  const { data: draft, error } = await admin
    .from("drafts")
    .upsert(
      {
        lead_id: lead.id,
        quote_type: quoteType,
        typebegrunnelse: generated.typebegrunnelse,
        agent_status: generated.status,
        merknader: generated.merknader,
        ikke_funnet: generated.ikke_funnet,
        estimat_timer: generated.estimat_timer,
        confidence: confidence.level,
        confidence_note: confidence.reasons.join("\n"),
        email_subject: generated.email_subject,
        email_body: generated.email_body,
        document: generated.document,
        // Ny generering ugyldiggjør en tidligere PDF.
        pdf_path: null,
      },
      { onConflict: "lead_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Logg den originale AI-versjonen før brukeren rører noe.
  await logDraftVersion(admin, {
    draftId: draft.id,
    source: "ai",
    snapshot: {
      quote_type: quoteType,
      email_subject: generated.email_subject,
      email_body: generated.email_body,
      document: generated.document,
    },
    userId: opts.userId,
  });

  await settStatus(admin, lead.id, lead.status);

  return { leadId: lead.id, draft, reused: false };
}

/** Et bekreftet lead blir stående bekreftet. Alt annet er nå klart. */
async function settStatus(admin: SupabaseClient, leadId: string, forrige: string) {
  await admin
    .from("leads")
    .update({
      status: forrige === "bekrefta" ? "bekrefta" : "utkast_klar",
      generation_error: null,
    })
    .eq("id", leadId);
}

/**
 * Henter den siste lagrede versjonen for en tilbudstype, om den finnes.
 *
 * draft_versions er allerede en full logg over hver versjon med sin type, så vi
 * trenger ingen egen cache — og fordi vi henter den *siste* versjonen, får
 * brukeren tilbake sine egne redigeringer, ikke den opprinnelige AI-teksten.
 */
async function reuseStoredVersion(
  admin: SupabaseClient,
  leadId: string,
  quoteType: QuoteType,
  companyId: string,
) {
  const { data: draft } = await admin
    .from("drafts")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!draft) return null;

  const { data: version } = await admin
    .from("draft_versions")
    .select("email_subject, email_body, document")
    .eq("draft_id", draft.id)
    .eq("quote_type", quoteType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return null;

  // Nivået henger på tilbudstypen, og det er typen som byttes her. Prisfilen
  // kan dessuten ha endret seg siden utkastet ble laget, så vi teller postene
  // mot dagens aktive rader i stedet for å gjenbruke et gammelt tall.
  const [{ data: references }, priceItems] = await Promise.all([
    admin.from("reference_quotes").select("type").eq("company_id", companyId),
    activePriceItems(admin, companyId),
  ]);

  const document = version.document as QuoteDocument | null;
  const confidence = assessConfidence({
    quoteType,
    references: references ?? [],
    priceItems,
    document,
    unresolvedLines: countUnresolvedLines(document, priceItems),
  });

  const { data: updated } = await admin
    .from("drafts")
    .update({
      quote_type: quoteType,
      confidence: confidence.level,
      confidence_note: confidence.reasons.join("\n"),
      email_subject: version.email_subject ?? "",
      email_body: version.email_body ?? "",
      document: version.document,
      // PDF-en hører til den forrige typen og er ikke gyldig lenger.
      pdf_path: null,
    })
    .eq("id", draft.id)
    .select("*")
    .single();

  return updated;
}
