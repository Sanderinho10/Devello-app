import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteDocument, QuoteType } from "@/lib/types";

export interface DraftSnapshot {
  quote_type: QuoteType;
  email_subject: string;
  email_body: string;
  document: QuoteDocument | null;
}

/**
 * Loggar ein versjon av utkastet.
 *
 * Vi loggar alltid — original AI-tekst, kvar redigering og den endelege
 * versjonen — uansett om noko faktisk blei endra. Dette er læringsdata, og eit
 * tomt diff er like informativt som eit stort: det fortel at agenten trefte.
 */
export async function logDraftVersion(
  supabase: SupabaseClient,
  input: {
    draftId: string;
    source: "ai" | "redigering" | "endeleg";
    snapshot: DraftSnapshot;
    previous?: DraftSnapshot | null;
    userId?: string | null;
  },
): Promise<void> {
  const { data: latest } = await supabase
    .from("draft_versions")
    .select("version")
    .eq("draft_id", input.draftId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (latest?.version ?? 0) + 1;

  await supabase.from("draft_versions").insert({
    draft_id: input.draftId,
    version,
    source: input.source,
    quote_type: input.snapshot.quote_type,
    email_subject: input.snapshot.email_subject,
    email_body: input.snapshot.email_body,
    document: input.snapshot.document,
    diff: input.previous ? diffSnapshots(input.previous, input.snapshot) : null,
    created_by: input.userId ?? null,
  });
}

export function diffSnapshots(
  before: DraftSnapshot,
  after: DraftSnapshot,
): Record<string, { for: unknown; etter: unknown }> {
  const diff: Record<string, { for: unknown; etter: unknown }> = {};

  if (before.quote_type !== after.quote_type) {
    diff.quote_type = { for: before.quote_type, etter: after.quote_type };
  }
  if (before.email_subject !== after.email_subject) {
    diff.email_subject = { for: before.email_subject, etter: after.email_subject };
  }
  if (before.email_body !== after.email_body) {
    diff.email_body = { for: before.email_body, etter: after.email_body };
  }
  if (JSON.stringify(before.document) !== JSON.stringify(after.document)) {
    diff.document = { for: before.document, etter: after.document };
  }

  return diff;
}
