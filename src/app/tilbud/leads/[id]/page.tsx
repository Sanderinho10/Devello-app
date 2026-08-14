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

  // Prisfila følgjer med slik at brukaren kan leggje til postar i utkastet.
  // Nye postar må kome herifrå — det er same regel som gjeld for agenten.
  const [{ data: brand }, { data: priceItems }] = await Promise.all([
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", lead.company_id)
      .maybeSingle(),
    supabase
      .from("price_list_items")
      .select("*")
      .eq("company_id", lead.company_id)
      .eq("active", true)
      .order("kind")
      .order("name"),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <Link className="button ghost" href="/tilbud/leads" style={{ marginLeft: -10 }}>
            ← Leads
          </Link>
          <h1 style={{ marginTop: 6 }}>{lead.subject || "(utan emne)"}</h1>
          <p className="page-subtitle">
            {[lead.from_name, lead.from_email, formatDate(lead.received_at)]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {draft ? (
        <DraftEditor
          lead={lead as Lead}
          draft={draft as Draft}
          brand={brand ?? null}
          priceItems={(priceItems ?? []) as PriceListItem[]}
        />
      ) : (
        <div className="card empty">
          <div className="empty-title">Ingen utkast enno</div>
          <div>Gå tilbake til leads og trykk «Generer utkast».</div>
        </div>
      )}
    </>
  );
}
