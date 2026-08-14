import { NextResponse } from "next/server";
import { fetchInboxMessages, messageToPlainText } from "@/lib/graph/client";
import { accessTokenFor } from "@/lib/graph/oauth";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * «Hent leads» — manuell knapp i v1. Fase 2 legger til automatisk polling, men
 * selve logikken her blir den samme.
 *
 * Dedupe skjer på Graphs message-id via unique (company_id, external_message_id).
 */
export async function POST() {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const admin = supabaseAdmin();

  const { data: mailbox } = await admin
    .from("mailbox_connections")
    .select("id, last_synced_at")
    .eq("company_id", session.companyId)
    .eq("status", "aktiv")
    .maybeSingle();

  if (!mailbox) {
    return NextResponse.json(
      { error: "Ingen aktiv postkasse. Koble til under Innstillinger." },
      { status: 400 },
    );
  }

  const { data: run } = await admin
    .from("agent_runs")
    .insert({
      company_id: session.companyId,
      mailbox_connection_id: mailbox.id,
      kind: "hent_leads",
      triggered_by: session.userId,
    })
    .select("id")
    .single();

  try {
    const token = await accessTokenFor(mailbox.id);
    const messages = await fetchInboxMessages(token, {
      since: mailbox.last_synced_at,
      limit: 25,
    });

    const rows = messages.map((message) => ({
      company_id: session.companyId,
      mailbox_connection_id: mailbox.id,
      external_message_id: message.id,
      conversation_id: message.conversationId,
      from_name: message.from?.emailAddress?.name ?? null,
      from_email: message.from?.emailAddress?.address ?? null,
      subject: message.subject,
      body_preview: message.bodyPreview,
      body_text: messageToPlainText(message),
      received_at: message.receivedDateTime,
    }));

    let inserted = 0;
    if (rows.length > 0) {
      // ignoreDuplicates lar alt som allerede er hentet ligge i fred.
      const { data, error } = await admin
        .from("leads")
        .upsert(rows, {
          onConflict: "company_id,external_message_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(error.message);
      inserted = data?.length ?? 0;
    }

    await admin
      .from("mailbox_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", mailbox.id);

    await admin
      .from("agent_runs")
      .update({
        status: "ok",
        finished_at: new Date().toISOString(),
        leads_found: rows.length,
        leads_new: inserted,
      })
      .eq("id", run!.id);

    return NextResponse.json({ found: rows.length, new: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("agent_runs")
      .update({ status: "feil", finished_at: new Date().toISOString(), error: message })
      .eq("id", run!.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
