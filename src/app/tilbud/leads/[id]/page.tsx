import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftEditor } from "./DraftEditor";
import { supabaseServer } from "@/lib/supabase/server";
import {
  formatDate,
  type Draft,
  type Lead,
  type PriceListItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const { data: draft } = await supabase
    .from("drafts")
    .select("*")
    .eq("lead_id", id)
    .maybeSingle();

  // Prisfilen følger med slik at brukeren kan legge til poster i utkastet.
  // Nye poster må komme herfra — det er samme regel som gjelder for agenten, og
  // bare fra aktive lister, slik at en deaktivert liste ikke kan snike seg inn.
  const [{ data: brand }, { data: activeLists }] = await Promise.all([
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", lead.company_id)
      .maybeSingle(),
    supabase
      .from("price_lists")
      .select("id")
      .eq("company_id", lead.company_id)
      .eq("active", true),
  ]);

  const listIds = (activeLists ?? []).map((list) => list.id);
  const { data: priceItems } = listIds.length
    ? await supabase
        .from("price_list_items")
        .select("*")
        .in("price_list_id", listIds)
        .eq("active", true)
        .order("kind")
        .order("name")
    : { data: [] };

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="button ghost" href="/tilbud/leads" style={{ marginLeft: -10 }}>
            ← Leads
          </Link>
          <h1 style={{ marginTop: 6 }}>{lead.subject || "(uten emne)"}</h1>
          <p className="page-subtitle">
            {[lead.from_name, lead.from_email, formatDate(lead.received_at)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {draft ? (
        <div className="detail-layout">
          <DraftEditor
            lead={lead as Lead}
            draft={draft as Draft}
            brand={brand ?? null}
            priceItems={(priceItems ?? []) as PriceListItem[]}
          />

          {/*
            Henvendelsen står ved siden av utkastet, ikke bak et klikk. Det er
            den man leser mot mens man retter — «ba kunden faktisk om fire
            stikkontakter?» er spørsmålet man stiller hele veien.
          */}
          <aside className="inquiry">
            <div className="inquiry-head">Henvendelsen</div>
            <div className="inquiry-meta">
              <div>{[lead.from_name, lead.from_email].filter(Boolean).join(" · ")}</div>
              <div>{formatDate(lead.received_at)}</div>
            </div>
            {lead.body_text || lead.body_preview ? (
              <div className="inquiry-body">
                {lead.body_text || lead.body_preview}
              </div>
            ) : (
              <p className="muted tiny">Denne e-posten har ingen tekst.</p>
            )}
          </aside>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-title">Ingen utkast ennå</div>
          <div>Gå tilbake til leads og trykk «Generer utkast».</div>
        </div>
      )}
    </>
  );
}
