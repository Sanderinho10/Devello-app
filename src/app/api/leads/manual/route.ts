import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

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
        status: "ny",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
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
