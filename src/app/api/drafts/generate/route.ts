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
 * Genererer utkast for eit lead.
 *
 * 1. Klassifiser tilbudstype (om brukaren ikkje har valt ein sjølv)
 * 2. Hent strukturerte prisrader — agenten slår opp, reknar aldri
 * 3. Generer dokument + kort e-posttekst, eller berre tekst for tid og materiell
 * 4. Logg den originale AI-versjonen
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = (await request.json()) as {
    lead_id?: string;
    quote_type?: QuoteType;
    /** Tvingar eit nytt modellkall sjølv om vi har eit lagra utkast frå før. */
    force?: boolean;
  };
  if (!body.lead_id) {
    return NextResponse.json({ error: "Manglar lead_id" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: lead } = await admin
    .from("leads")
    .select("*")
    .eq("id", body.lead_id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Fann ikkje leadet" }, { status: 404 });
  }

  // Har vi generert denne typen for dette leadet før, brukar vi den lagra
  // versjonen. Å bytte fram og tilbake på type-bryteren skal ikkje koste eit
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
    const [{ data: company }, { data: priceItems }, { data: references }] =
      await Promise.all([
        admin
          .from("companies")
          .select("name, tone_settings")
          .eq("id", session.companyId)
          .single(),
        admin
          .from("price_list_items")
          .select("*")
          .eq("company_id", session.companyId)
          .eq("active", true),
        admin
          .from("reference_quotes")
          .select("title, type, job_description")
          .eq("company_id", session.companyId),
      ]);

    const leadText = lead.body_text || lead.body_preview || "";

    // Brukaren kan overstyre typen frå bryteren; elles klassifiserer agenten.
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
      priceItems: (priceItems ?? []) as PriceListItem[],
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
          // Ny generering ugyldiggjer ein tidlegare PDF.
          pdf_path: null,
        },
        { onConflict: "lead_id" },
      )
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    // Logg den originale AI-versjonen før brukaren rører noko.
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
 * Hentar den siste lagra versjonen for ein tilbudstype, om den finst.
 *
 * draft_versions er alt ein full logg over kvar versjon med sin type, så vi
 * treng ingen eigen cache — og fordi vi hentar den *siste* versjonen, får
 * brukaren tilbake sine eigne redigeringar, ikkje den opphavlege AI-teksten.
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
      // PDF-en høyrer til den førre typen og er ikkje gyldig lenger.
      pdf_path: null,
    })
    .eq("id", draft.id)
    .select("*")
    .single();

  return updated;
}
