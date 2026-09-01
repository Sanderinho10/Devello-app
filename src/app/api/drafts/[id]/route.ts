import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { QuoteDocument, QuoteType } from "@/lib/types";

/**
 * Lagrer utkastet uten å kalle modellen.
 *
 * To grunner til at denne finnes: redigeringer skal overleve en sideoppdatering,
 * og både PDF-forhåndsvisningen og bekreft-flyten leser fra databasen — uten en
 * lagring ville de vist en eldre versjon enn den på skjermen.
 *
 * Endringer blir logget som en «redigering»-versjon, men bare når noe faktisk
 * er annerledes. Ellers ville hvert tastetrykk bli en rad i læringsdataene.
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
    return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
  }

  // Låsen hører hjemme her, ikke bare i skjemaet. En fane som stod åpen fra
  // før tilbudet ble sendt, vet ingenting om at det er sendt.
  if (draft.sent_at) {
    return NextResponse.json(
      { error: "Tilbudet er sendt og kan ikke endres." },
      { status: 409 },
    );
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
        // En lagret PDF hører til det gamle innholdet.
        pdf_path: null,
      })
      .eq("id", draft.id);
    if (error) throw new Error(error.message);

    // Med vilje ingen versjonslogg her. To versjoner er nok per tilbud:
    // AI-ens originale utkast (kilden) og det som faktisk gikk ut (fasiten).
    // Mellomstegene — hver lagring underveis — er arbeidsprosess, ikke
    // læringsdata, og hver rad var en kopi av hele dokumentet.

    return NextResponse.json({ ok: true, changed: true });
  } catch (err) {
    return errorResponse(err);
  }
}
