import { NextResponse, type NextRequest } from "next/server";
import { generateForLead } from "@/lib/drafts/generate-for-lead";
import { sessionOr401, errorResponse } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteType } from "@/lib/types";

export const maxDuration = 300;

/**
 * Genererer utkast for et lead, og venter på svaret.
 *
 * Selve arbeidet ligger i lib/drafts/generate-for-lead.ts, fordi det også
 * kjøres i bakgrunnen når en manuell henvendelse lagres. Denne ruta er
 * varianten der brukeren står og ser på.
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

  try {
    const result = await generateForLead(supabaseAdmin(), {
      leadId: body.lead_id,
      companyId: session.companyId,
      userId: session.userId,
      quoteType: body.quote_type ?? null,
      force: body.force,
    });
    return NextResponse.json({
      lead_id: result.leadId,
      draft: result.draft,
      reused: result.reused,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Fant ikke leadet") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
