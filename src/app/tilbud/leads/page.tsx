import Link from "next/link";
import { LeadActions } from "./LeadActions";
import { AutoRefresh } from "./AutoRefresh";
import { LeadRow } from "./LeadRow";
import { ManualLead } from "./ManualLead";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string }>;
}) {
  const session = await currentSession();
  const supabase = await supabaseServer();

  // Arkivet er sendte tilbud. De hører ikke hjemme i arbeidslisten — jobben
  // er gjort — men de skal være til å finne igjen, saa de faar sin egen
  // visning i stedet for aa forsvinne.
  const arkiv = (await searchParams).vis === "arkiv";

  const [{ data: leads }, { data: mailbox }, { data: lastRun }, { count: iArkiv }, { count: iArbeid }] =
    await Promise.all([
    supabase
      .from("leads")
      .select("*")
      [arkiv ? "eq" : "neq"]("status", "sendt")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("mailbox_connections")
      .select("email_address, status, status_reason")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase
      .from("agent_runs")
      .select("finished_at, status, leads_new")
      .eq("kind", "hent_leads")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "sendt"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .neq("status", "sendt"),
  ]);

  const rows = (leads ?? []) as Lead[];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leads</h1>
          <p className="page-subtitle">
            {mailbox
              ? `Innkommende forespørsler fra ${mailbox.email_address}`
              : "Ingen postkasse tilkoblet ennå"}
          </p>
        </div>
        <div className="row">
          <ManualLead />
          {mailbox && <LeadActions kind="hent" />}
        </div>
      </div>

      {!mailbox && (
        <div className="banner warning">
          Koble til en Microsoft 365-postkasse under{" "}
          <Link href="/tilbud/innstillinger" style={{ textDecoration: "underline" }}>
            Innstillinger
          </Link>{" "}
          for å hente leads.
        </div>
      )}

      {mailbox?.status === "token_utlopt" && (
        <div className="banner error">
          <div style={{ marginBottom: 10 }}>
            {mailbox.status_reason ??
              "Tilgangen til postkassen virker ikke lenger. Koble til på nytt."}
          </div>
          <a className="button" href="/api/auth/microsoft/start?paanytt=1">
            Koble til på nytt
          </a>
        </div>
      )}

      <div className="card">
        <div className="card-header row-between">
          <div className="type-switch kompakt">
            <Link
              href="/tilbud/leads"
              className={`type-option${arkiv ? "" : " active"}`}
            >
              Arbeidsliste {iArbeid ?? 0}
            </Link>
            <Link
              href="/tilbud/leads?vis=arkiv"
              className={`type-option${arkiv ? " active" : ""}`}
            >
              Arkiv {iArkiv ?? 0}
            </Link>
          </div>
          {lastRun?.finished_at && !arkiv && (
            <span className="muted tiny">
              Sist hentet {formatDate(lastRun.finished_at)}
              {lastRun.status === "feil" && " — feilet"}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {arkiv ? "Ingen sendte tilbud ennå" : "Ingen leads ennå"}
            </div>
            <div>
              {arkiv
                ? "Tilbud havner her når du har merket dem som sendt."
                : "Trykk «Hent leads» for å lese innboksen, eller «Manuell henvendelse» for en jobb som kom på telefon."}
            </div>
          </div>
        ) : (
          <div className="lead-list">
            {rows.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>

      <AutoRefresh aktiv={rows.some((lead) => lead.status === "genererer")} />
    </>
  );
}
