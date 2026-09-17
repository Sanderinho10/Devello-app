import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceLine, InvoiceTotals } from "./typar";

export interface FakturaSnapshot {
  lines: InvoiceLine[];
  totals: InvoiceTotals;
  invoice_text: string | null;
}

/**
 * Logger en versjon av fakturaforslaget — samme idé som draft_versions for
 * tilbud: originalen fra agenten, hver redigering, og det som ble overført.
 * Et tomt diff er like informativt som et stort: agenten traff.
 *
 * Feiler loggingen, stopper den ikke det brukeren holdt på med, men feilen
 * står i loggen (se lib/drafts/versions.ts for hvorfor det ble slik).
 */
export async function loggFakturaVersjon(
  admin: SupabaseClient,
  input: {
    draftId: string;
    source: "ai" | "redigering" | "overfort";
    snapshot: FakturaSnapshot;
    previous?: FakturaSnapshot | null;
    userId?: string | null;
  },
): Promise<boolean> {
  const { data: siste } = await admin
    .from("invoice_draft_versions")
    .select("version")
    .eq("draft_id", input.draftId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (siste?.version ?? 0) + 1;

  const { error } = await admin.from("invoice_draft_versions").insert({
    draft_id: input.draftId,
    version,
    source: input.source,
    lines: input.snapshot.lines,
    totals: input.snapshot.totals,
    invoice_text: input.snapshot.invoice_text,
    diff: input.previous ? diffFaktura(input.previous, input.snapshot) : null,
    created_by: input.userId ?? null,
  });
  if (error) {
    console.error(
      `invoice_draft_versions: klarte ikke å logge versjon ${version} (${input.source}) for utkast ${input.draftId}: ${error.message}`,
    );
    return false;
  }
  return true;
}

/**
 * Diffen per linje: lagt til, fjernet, endret (hvilke felt). Pluss tekst og
 * summer. Nøkkelen er linje-id, så en omskrevet beskrivelse og en ny linje
 * ikke ser like ut i læringsdataene.
 */
export function diffFaktura(
  before: FakturaSnapshot,
  after: FakturaSnapshot,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const foer = new Map(before.lines.map((l) => [l.id, l]));
  const etter = new Map(after.lines.map((l) => [l.id, l]));

  const lagtTil = after.lines.filter((l) => !foer.has(l.id)).map((l) => l.id);
  const fjerna = before.lines.filter((l) => !etter.has(l.id)).map((l) => l.id);
  const endra: Record<string, Record<string, { for: unknown; etter: unknown }>> = {};
  const FELT: (keyof InvoiceLine)[] = ["description", "quantity", "unit", "unit_price", "included"];
  for (const [id, a] of etter) {
    const b = foer.get(id);
    if (!b) continue;
    const e: Record<string, { for: unknown; etter: unknown }> = {};
    for (const f of FELT) {
      if (JSON.stringify(b[f]) !== JSON.stringify(a[f])) e[f] = { for: b[f], etter: a[f] };
    }
    if (Object.keys(e).length) endra[id] = e;
  }
  if (lagtTil.length) diff.lagt_til = lagtTil;
  if (fjerna.length) diff.fjernet = fjerna;
  if (Object.keys(endra).length) diff.endret = endra;
  if ((before.invoice_text ?? "") !== (after.invoice_text ?? "")) {
    diff.invoice_text = { for: before.invoice_text, etter: after.invoice_text };
  }
  if (JSON.stringify(before.totals) !== JSON.stringify(after.totals)) {
    diff.totals = { for: before.totals, etter: after.totals };
  }
  return diff;
}
