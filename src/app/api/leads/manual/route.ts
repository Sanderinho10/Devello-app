import { randomUUID } from "node:crypto";
import { NextResponse, after, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { generateForLead } from "@/lib/drafts/generate-for-lead";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * Manuell henvendelse — for jobber som kom på telefon eller over disk.
 *
 * Lager et lead av det saksbehandleren skriver. Derfra er flyten den samme
 * som for e-post: generer utkast, rediger, bekreft. Den eneste forskjellen
 * er at bekreft lager en ny e-post i stedet for et svar i en tråd.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json()) as {
      description?: string;
      customer_name?: string;
      customer_email?: string;
    };

    const description = (body.description ?? "").trim();
    if (!description) {
      return NextResponse.json(
        { error: "Skriv hva kunden spurte om." },
        { status: 400 },
      );
    }

    const customerName = (body.customer_name ?? "").trim() || null;
    const customerEmail = (body.customer_email ?? "").trim() || null;

    const admin = supabaseAdmin();
    const { data: lead, error } = await admin
      .from("leads")
      .insert({
        company_id: session.companyId,
        source: "manuell",
        // Ingen postkasse og ingen ekte melding å svare på.
        mailbox_connection_id: null,
        external_message_id: `manuell:${randomUUID()}`,
        from_name: customerName,
        from_email: customerEmail,
        subject: deriveSubject(description),
        body_preview: description.slice(0, 240),
        body_text: description,
        received_at: new Date().toISOString(),
        // Linjen skal si sannheten fra første sekund: agenten er i gang.
        status: "genererer",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    // Genereringen tar et minutt, og ingen skal sitte og se på en spinner så
    // lenge. Svaret går ut nå; after() kjører resten etterpå, i samme prosess.
    // Brukeren ser linjen i listen med det samme og kan skrive inn neste jobb
    // mens agenten holder på.
    after(async () => {
      try {
        await generateForLead(admin, {
          leadId: lead.id,
          companyId: session.companyId,
          userId: session.userId,
        });
      } catch (err) {
        // Et lead som blir stående på «genererer» for alltid er verre enn et
        // som sier hva som gikk galt.
        const melding = err instanceof Error ? err.message : String(err);
        console.error("Bakgrunnsgenerering feilet:", melding);
        await admin
          .from("leads")
          .update({ status: "ny", generation_error: melding })
          .eq("id", lead.id);
      }
    });

    return NextResponse.json({ lead_id: lead.id });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Emnet er bare til listen — agenten lager sin egen tittel. Første linje er
 * nesten alltid det saksbehandleren ville kalt saken selv.
 */
function deriveSubject(description: string): string {
  const firstLine = description.split("\n")[0].trim();
  if (!firstLine) return "Manuell henvendelse";
  return firstLine.length <= 70 ? firstLine : `${firstLine.slice(0, 67).trimEnd()}…`;
}
