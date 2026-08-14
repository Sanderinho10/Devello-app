import { SettingsForm } from "./SettingsForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InnstillingarPage({
  searchParams,
}: {
  searchParams: Promise<{ kopla?: string; feil?: string }>;
}) {
  const params = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: brand }, { data: mailbox }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, org_nr, tone_settings")
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
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillingar</h1>
          <p className="page-subtitle">
            Postkasse, merkevare og tone for tilbudsagenten.
          </p>
        </div>
      </div>

      {params.kopla && (
        <div className="banner success">Kopla til {params.kopla}.</div>
      )}
      {params.feil && <div className="banner error">{params.feil}</div>}

      <div className="stack">
        {/* Postkasse */}
        <div className="card">
          <div className="card-header">
            <div>
              <strong>Postkasse</strong>
              <div className="tiny muted">Microsoft 365 / Outlook</div>
            </div>
            <a className="button" href="/api/auth/microsoft/start">
              {mailbox ? "Kople til på nytt" : "Kople til Microsoft 365"}
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
                    {mailbox.status === "aktiv" ? "Aktiv" : "Treng ny tilkopling"}
                  </span>
                </div>
                <div className="tiny muted">
                  Sist synkronisert: {formatDate(mailbox.last_synced_at)}
                </div>
              </div>
            ) : (
              <p className="muted">
                Ingen postkasse tilkopla. Du samtykker sjølv ved tilkopling — det
                trengst ingen godkjenning frå IT-avdelinga.
              </p>
            )}
            <div className="tiny muted" style={{ marginTop: 14 }}>
              Appen ber om Mail.Read og Mail.ReadWrite. Den ber aldri om Mail.Send:
              vi lagar kladdar, du trykker send sjølv.
            </div>
          </div>
        </div>

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
