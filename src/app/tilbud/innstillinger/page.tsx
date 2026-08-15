import { SettingsForm } from "./SettingsForm";
import { Members } from "./Members";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Invitation, type Member } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InnstillingerPage({
  searchParams,
}: {
  searchParams: Promise<{ koblet?: string; feil?: string }>;
}) {
  const params = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: brand }, { data: mailbox }, { data: members }, { data: invitations }] =
    await Promise.all([
    supabase
      .from("companies")
      .select("name, org_nr, tone_settings, trial_ends_at, plan")
      .eq("id", session!.companyId)
      .single(),
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase
      .from("mailbox_connections")
      .select("email_address, status, last_synced_at")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, email, full_name, role")
      .eq("company_id", session!.companyId)
      .order("role")
      .order("email"),
    supabase
      .from("invitations")
      .select("id, email, role, accepted_at, expires_at, created_at")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const me = (members ?? []).find((member) => member.id === session!.userId);
  const isAdmin = me?.role === "admin";

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">
            Postkasse, merkevare og tone for tilbudsagenten.
          </p>
        </div>
      </div>

      {params.koblet && (
        <div className="banner success">Koblet til {params.koblet}.</div>
      )}
      {params.feil && <div className="banner error">{params.feil}</div>}

      {company?.trial_ends_at && !company.plan && (
        <div className="banner info">
          Prøveperioden varer til {formatDate(company.trial_ends_at)}. Du velger
          pakke før eller etter at den er ute — ingenting blir trukket automatisk.
        </div>
      )}

      <div className="stack">
        {/* Postkasse */}
        <div className="card">
          <div className="card-header">
            <div>
              <strong>Postkasse</strong>
              <div className="tiny muted">Microsoft 365 / Outlook</div>
            </div>
            <a className="button" href="/api/auth/microsoft/start">
              {mailbox ? "Koble til på nytt" : "Koble til Microsoft 365"}
            </a>
          </div>
          <div className="card-pad">
            {mailbox ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row-between">
                  <span>{mailbox.email_address}</span>
                  <span
                    className={`pill ${mailbox.status === "aktiv" ? "bekrefta" : "utkast_klar"}`}
                  >
                    {mailbox.status === "aktiv" ? "Aktiv" : "Trenger ny tilkobling"}
                  </span>
                </div>
                <div className="tiny muted">
                  Sist synkronisert: {formatDate(mailbox.last_synced_at)}
                </div>
              </div>
            ) : (
              <p className="muted">
                Ingen postkasse tilkoblet. Du samtykker selv ved tilkobling — det
                trengs ingen godkjenning fra IT-avdelingen.
              </p>
            )}
            <div className="tiny muted" style={{ marginTop: 14 }}>
              Appen ber om Mail.Read og Mail.ReadWrite. Den ber aldri om Mail.Send:
              vi lager kladder, du trykker send selv.
            </div>
          </div>
        </div>

        <Members
          members={(members ?? []) as Member[]}
          invitations={(invitations ?? []) as Invitation[]}
          isAdmin={isAdmin}
        />

        <SettingsForm
          company={{
            name: company?.name ?? "",
            org_nr: company?.org_nr ?? "",
            tone_settings: company?.tone_settings ?? {},
          }}
          brand={brand ?? null}
        />
      </div>
    </>
  );
}
