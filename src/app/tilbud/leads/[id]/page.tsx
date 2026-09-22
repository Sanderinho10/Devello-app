import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftEditor } from "./DraftEditor";
import { harModul } from "@/lib/moduler";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { vedleggFor, velgTilModell } from "@/lib/leads/vedlegg";
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

  // Leadet over er hentet med brukerens tilgang, så selskapet er sjekket.
  // Vedleggstabellen er bare for service role.
  const vedlegg = await vedleggFor(supabaseAdmin(), lead.id);
  const tilModell = velgTilModell(vedlegg);

  const { data: draft } = await supabase
    .from("drafts")
    .select("*")
    .eq("lead_id", id)
    .maybeSingle();

  // Prisfilen følger med slik at brukeren kan legge til poster i utkastet.
  // Nye poster må komme herfra — det er samme regel som gjelder for agenten, og
  // bare fra aktive lister, slik at en deaktivert liste ikke kan snike seg inn.
  const [
    { data: brand },
    { data: company },
    { data: activeLists },
    { data: mailbox },
    { data: ordre },
  ] = await Promise.all([
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", lead.company_id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("billing_address_line, billing_postal_code, billing_city, moduler")
      .eq("id", lead.company_id)
      .single(),
    supabase
      .from("price_lists")
      .select("id")
      .eq("company_id", lead.company_id)
      .eq("active", true),
    // Uten postkasse handler bekreft om PDF-en, ikke om en kladd i Outlook.
    // Knappene skal si det fra starten, ikke først etterpå.
    supabase
      .from("mailbox_connections")
      .select("id")
      .eq("company_id", lead.company_id)
      .maybeSingle(),
    // Finnes det en ordre for dette utkastet, blir «Opprett ordre» en lenke.
    draft
      ? supabase.from("orders").select("id, order_no").eq("draft_id", draft.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const listIds = (activeLists ?? []).map((list) => list.id);
  const { data: priceItems } = listIds.length
    ? await supabase
        .from("price_list_items")
        .select("*")
        .in("price_list_id", listIds)
        .eq("active", true)
        .order("kind")
        .order("position")
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
            address={{
              line: company?.billing_address_line ?? null,
              postalCode: company?.billing_postal_code ?? null,
              city: company?.billing_city ?? null,
            }}
            priceItems={(priceItems ?? []) as PriceListItem[]}
            harPostkasse={Boolean(mailbox)}
            ordre={{
              aktiv: harModul(company?.moduler, "ordre"),
              eksisterande: ordre ?? null,
            }}
          />

          {/*
            Henvendelsen står ved siden av utkastet, ikke bak et klikk. Det er
            den man leser mot mens man retter — «ba kunden faktisk om fire
            stikkontakter?» er spørsmålet man stiller hele veien.
          */}
          <aside className="inquiry">
            <div className="inquiry-head">
              {lead.source === "manuell" ? "Manuell henvendelse" : "Henvendelsen"}
            </div>
            <div className="inquiry-meta">
              <div>
                {[lead.from_name, lead.from_email].filter(Boolean).join(" · ") ||
                  "(ingen kontaktinfo)"}
              </div>
              <div>{formatDate(lead.received_at)}</div>
            </div>
            {lead.body_text || lead.body_preview ? (
              <div className="inquiry-body">
                {lead.body_text || lead.body_preview}
              </div>
            ) : (
              <p className="muted tiny">Denne e-posten har ingen tekst.</p>
            )}

            {vedlegg.length > 0 && (
              <div className="inquiry-vedlegg">
                <div className="inquiry-head" style={{ marginBottom: 8 }}>
                  Vedlegg · {vedlegg.length}
                </div>
                <div className="vedlegg-grid">
                  {vedlegg.map((v, i) => {
                    const href = `/api/leads/${lead.id}/vedlegg/${v.id}`;
                    const pdf = v.mime_type === "application/pdf";
                    return (
                      <a
                        key={v.id}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className={`vedlegg-kort${tilModell[i] ? "" : " ikke-lest"}`}
                        title={
                          tilModell[i]
                            ? `${v.file_name} — agenten har sett denne`
                            : `${v.file_name} — over taket, ikke sendt til agenten`
                        }
                      >
                        {pdf ? (
                          <span className="vedlegg-pdf">
                            PDF
                            <span className="tiny">
                              {v.pages} {v.pages === 1 ? "side" : "sider"}
                            </span>
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={href} alt={v.file_name} loading="lazy" />
                        )}
                        <span className="vedlegg-navn">{v.file_name}</span>
                      </a>
                    );
                  })}
                </div>
                {tilModell.some((m) => !m) && (
                  <p className="muted tiny" style={{ margin: "8px 0 0" }}>
                    Gråe vedlegg er over taket og ble ikke sendt til agenten.
                  </p>
                )}
              </div>
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
