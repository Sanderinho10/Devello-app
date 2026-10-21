import Link from "next/link";
import { LeadActions } from "./LeadActions";
import { AutoRefresh } from "./AutoRefresh";
import { LeadRow } from "./LeadRow";
import { ManualLead } from "./ManualLead";
import { SkjulbartVarsel } from "@/components/SkjulbartVarsel";
import { SortKolonne } from "@/components/SortKolonne";
import { lesSortering } from "@/lib/sortering";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const KOLONNER = ["nr", "emne", "avsender", "status", "mottatt"] as const;

/** Kolonnen i databasen. «nr» står på utkastet og sorteres etter henting. */
const DB_KOLONNE: Record<(typeof KOLONNER)[number], string> = {
  nr: "received_at",
  emne: "subject",
  avsender: "from_name",
  status: "status",
  mottatt: "received_at",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string; sort?: string; retning?: string }>;
}) {
  const session = await currentSession();
  const supabase = await supabaseServer();

  // Arkivet er sendte tilbud. De hører ikke hjemme i arbeidslisten — jobben
  // er gjort — men de skal være til å finne igjen, saa de faar sin egen
  // visning i stedet for aa forsvinne.
  const sp = await searchParams;
  const arkiv = sp.vis === "arkiv";
  const sortering = lesSortering(sp, KOLONNER, { kolonne: "mottatt", stigende: false });

  const [
    { data: leads },
    { data: mailbox },
    { data: lastRun },
    { count: iArkiv },
    { count: iArbeid },
    { data: meg },
  ] = await Promise.all([
    supabase
      .from("leads")
      // Versjonen står på utkastet. Med den ser man i listen at et tilbud er
      // åpnet igjen etter at det ble sendt.
      .select("*, drafts(revisjon, quote_no)")
      [arkiv ? "eq" : "neq"]("status", "sendt")
      .order(DB_KOLONNE[sortering.kolonne], {
        ascending: sortering.kolonne === "nr" ? false : sortering.stigende,
        nullsFirst: false,
      })
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
    supabase
      .from("users")
      .select("skjulte_varsel")
      .eq("id", session!.userId)
      .maybeSingle(),
  ]);

  const rows = (leads ?? []) as (Lead & { drafts: DraftRevisjon })[];
  // Tilbudsnummeret står på utkastet, ikke på leadet, så det sorteres her.
  // Leads uten nummer havner sist uansett retning.
  if (sortering.kolonne === "nr") {
    const retning = sortering.stigende ? 1 : -1;
    rows.sort((a, b) => {
      const x = tilbudsnrAv(a.drafts);
      const y = tilbudsnrAv(b.drafts);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (x - y) * retning;
    });
  }
  const sortParams = { vis: arkiv ? "arkiv" : undefined };
  const skjulte: string[] = meg?.skjulte_varsel ?? [];

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
      </div>

      {!mailbox && (
        <SkjulbartVarsel id="ingen-postkasse" skjult={skjulte.includes("ingen-postkasse")}>
          Koble til en Microsoft 365-postkasse under{" "}
          <Link href="/selskap/innstillinger/postkasse" style={{ textDecoration: "underline" }}>
            Selskap → Innstillinger → Postkasse
          </Link>{" "}
          for å hente leads. Jobber dere med manuelle henvendelser, kan du
          krympe dette varselet.
        </SkjulbartVarsel>
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

      <nav className="type-switch kompakt" aria-label="Vis">
        <Link href="/tilbud/leads" className={`type-option${arkiv ? "" : " active"}`}>
          Arbeidsliste<span className="fane-tal">{iArbeid ?? 0}</span>
        </Link>
        <Link href="/tilbud/leads?vis=arkiv" className={`type-option${arkiv ? " active" : ""}`}>
          Arkiv<span className="fane-tal">{iArkiv ?? 0}</span>
        </Link>
      </nav>

      <div className="verktoylinje">
        {mailbox && <LeadActions kind="hent" />}
        <ManualLead />
        {lastRun?.finished_at && !arkiv && (
          <span className="verktoylinje-hoyre muted tiny">
            Sist hentet {formatDate(lastRun.finished_at)}
            {lastRun.status === "feil" && " — feilet"}
          </span>
        )}
      </div>

      <div className="card">
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
          <div className="tabell-rull">
            <table className="table klikkbar">
              <thead>
                <tr>
                  <SortKolonne kolonne="nr" sortering={sortering} sti="/tilbud/leads" params={sortParams}>
                    Nr
                  </SortKolonne>
                  <SortKolonne kolonne="emne" sortering={sortering} sti="/tilbud/leads" params={sortParams}>
                    Emne
                  </SortKolonne>
                  <SortKolonne kolonne="avsender" sortering={sortering} sti="/tilbud/leads" params={sortParams}>
                    Avsender
                  </SortKolonne>
                  <SortKolonne kolonne="status" sortering={sortering} sti="/tilbud/leads" params={sortParams}>
                    Status
                  </SortKolonne>
                  <SortKolonne
                    kolonne="mottatt"
                    sortering={sortering}
                    sti="/tilbud/leads"
                    params={sortParams}
                    className="num"
                  >
                    Mottatt
                  </SortKolonne>
                  <th aria-label="Handling" />
                </tr>
              </thead>
              <tbody>
                {rows.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    revisjon={revisjonAv(lead.drafts)}
                    tilbudsnr={tilbudsnrAv(lead.drafts)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AutoRefresh aktiv={rows.some((lead) => lead.status === "genererer")} />
    </>
  );
}

/**
 * drafts har ett utkast per lead, så PostgREST gir et objekt — men uten
 * kjent én-til-én-kobling blir det en liste. Vi tåler begge.
 */
type DraftRevisjon = { revisjon: number; quote_no: number | null } | { revisjon: number; quote_no: number | null }[] | null;

function revisjonAv(drafts: DraftRevisjon): number {
  const draft = Array.isArray(drafts) ? drafts[0] : drafts;
  return draft?.revisjon ?? 1;
}

function tilbudsnrAv(drafts: DraftRevisjon): number | null {
  const draft = Array.isArray(drafts) ? drafts[0] : drafts;
  return draft?.quote_no ?? null;
}
