import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { logDraftVersion } from "@/lib/drafts/versions";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteDocument, QuoteType } from "@/lib/types";

/**
 * Lagrar utkastet utan å kalle modellen.
 *
 * To grunnar til at denne finst: redigeringar skal overleve ei sideoppdatering,
 * og både PDF-forhandsvisninga og bekreft-flyten les frå databasen — utan ei
 * lagring ville dei vist ein eldre versjon enn den på skjermen.
 *
 * Endringar blir logga som ein «redigering»-versjon, men berre når noko faktisk
 * er annleis. Elles ville kvart tastetrykk bli ein rad i læringsdataa.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const payload = (await request.json()) as {
    quote_type: QuoteType;
    email_subject: string;
    email_body: string;
    document: QuoteDocument | null;
  };

  const admin = supabaseAdmin();

  const { data: draft } = await admin
    .from("drafts")
    .select("*, leads!inner(company_id)")
    .eq("id", id)
    .eq("leads.company_id", session.companyId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "Fann ikkje utkastet" }, { status: 404 });
  }

  try {
    const before = {
      quote_type: draft.quote_type as QuoteType,
      email_subject: draft.email_subject,
      email_body: draft.email_body,
      document: draft.document as QuoteDocument | null,
    };
    const after = {
      quote_type: payload.quote_type,
      email_subject: payload.email_subject,
      email_body: payload.email_body,
      document: payload.document,
    };

    const changed =
      before.quote_type !== after.quote_type ||
      before.email_subject !== after.email_subject ||
      before.email_body !== after.email_body ||
      JSON.stringify(before.document) !== JSON.stringify(after.document);

    if (!changed) return NextResponse.json({ ok: true, changed: false });

    const { error } = await admin
      .from("drafts")
      .update({
        ...after,
        // Ein lagra PDF høyrer til det gamle innhaldet.
        pdf_path: null,
      })
      .eq("id", draft.id);
    if (error) throw new Error(error.message);

    await logDraftVersion(admin, {
      draftId: draft.id,
      source: "redigering",
      snapshot: after,
      previous: before,
      userId: session.userId,
    });

    return NextResponse.json({ ok: true, changed: true });
  } catch (err) {
    return errorResponse(err);
  }
}
