import Link from "next/link";
import { LeadActions } from "./LeadActions";
import { LeadRow } from "./LeadRow";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: leads }, { data: mailbox }, { data: lastRun }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("mailbox_connections")
      .select("email_address, status")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase
      .from("agent_runs")
      .select("finished_at, status, leads_new")
      .eq("kind", "hent_leads")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
        {mailbox && <LeadActions kind="hent" />}
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
          Tilgangen til postkassen har gått ut. Koble til på nytt under Innstillinger.
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="row" style={{ gap: 14 }}>
            <strong>
              {rows.length} {rows.length === 1 ? "forespørsel" : "forespørsler"}
            </strong>
            {lastRun?.finished_at && (
              <span className="muted tiny">
                Sist hentet {formatDate(lastRun.finished_at)}
                {lastRun.status === "feil" && " — feilet"}
              </span>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty">
            <div className="empty-title">Ingen leads ennå</div>
            <div>Trykk «Hent leads» for å lese innboksen.</div>
          </div>
        ) : (
          <div className="lead-list">
            {rows.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
