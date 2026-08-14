import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyQuoteType } from "@/lib/claude/classify";
import { generateDraft } from "@/lib/claude/generate";
import { logDraftVersion } from "@/lib/drafts/versions";
import { sessionOr401, errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PriceListItem, QuoteType } from "@/lib/types";

export const maxDuration = 300;

/**
 * Genererer utkast for et lead.
 *
 * 1. Klassifiser tilbudstype (om brukeren ikke har valgt en selv)
 * 2. Hent strukturerte prisrader — agenten slår opp, regner aldri
 * 3. Generer dokument + kort e-posttekst, eller bare tekst for tid og materiell
 * 4. Logg den originale AI-versjonen
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = (await request.json()) as {
    lead_id?: string;
    quote_type?: QuoteType;
    /** Tvinger et nytt modellkall selv om vi har et lagret utkast fra før. */
    force?: boolean;
  };
  if (!body.lead_id) {
    return NextResponse.json({ error: "Mangler lead_id" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: lead } = await admin
    .from("leads")
    .select("*")
    .eq("id", body.lead_id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Fant ikke leadet" }, { status: 404 });
  }

  // Har vi generert denne typen for dette leadet før, bruker vi den lagrede
  // versjonen. Å bytte fram og tilbake på type-bryteren skal ikke koste et
  // modellkall per klikk.
  if (body.quote_type && !body.force) {
    const stored = await reuseStoredVersion(admin, lead.id, body.quote_type);
    if (stored) {
      await admin
        .from("leads")
        .update({ status: lead.status === "bekrefta" ? "bekrefta" : "utkast_klar" })
        .eq("id", lead.id);
      return NextResponse.json({ lead_id: lead.id, draft: stored, reused: true });
    }
  }

  try {
    const [{ data: company }, { data: references }, priceItems] =
      await Promise.all([
        admin
          .from("companies")
          .select("name, tone_settings")
          .eq("id", session.companyId)
          .single(),
        admin
          .from("reference_quotes")
          .select("title, type, job_description")
          .eq("company_id", session.companyId),
        activePriceItems(admin, session.companyId),
      ]);

    const leadText = lead.body_text || lead.body_preview || "";

    // Brukeren kan overstyre typen fra bryteren; ellers klassifiserer agenten.
    let quoteType = body.quote_type;
    let classificationNote: string | null = null;

    if (!quoteType) {
      const classification = await classifyQuoteType({
        subject: lead.subject,
        body: leadText,
        references: references ?? [],
      });
      quoteType = classification.quote_type;
      classificationNote = classification.note;
    }

    const generated = await generateDraft({
      quoteType,
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
    });

    const { data: draft, error } = await admin
      .from("drafts")
      .upsert(
        {
          lead_id: lead.id,
          quote_type: quoteType,
          classification_note: classificationNote,
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
      userId: session.userId,
    });

    await admin
      .from("leads")
      .update({ status: lead.status === "bekrefta" ? "bekrefta" : "utkast_klar" })
      .eq("id", lead.id);

    return NextResponse.json({ lead_id: lead.id, draft });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Prisrader fra aktive lister.
 *
 * En deaktivert liste blir liggende i databasen, men skal ikke kunne dukke opp
 * i et tilbud — derfor filtrerer vi på listen og ikke bare på raden.
 */
export async function activePriceItems(
  admin: SupabaseClient,
  companyId: string,
): Promise<PriceListItem[]> {
  const { data: lists } = await admin
    .from("price_lists")
    .select("id")
    .eq("company_id", companyId)
    .eq("active", true);

  const listIds = (lists ?? []).map((list) => list.id);
  if (listIds.length === 0) return [];

  const { data: items } = await admin
    .from("price_list_items")
    .select("*")
    .in("price_list_id", listIds)
    .eq("active", true);

  return (items ?? []) as PriceListItem[];
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

  const { data: updated } = await admin
    .from("drafts")
    .update({
      quote_type: quoteType,
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
