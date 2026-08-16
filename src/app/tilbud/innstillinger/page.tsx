import { FirstFetchFrom } from "./FirstFetchFrom";
import { SettingsForm } from "./SettingsForm";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InnstillingerPage({
  searchParams,
}: {
  searchParams: Promise<{ koblet?: string; feil?: string }>;
}) {
  const params = await searchParams;
  const session = await currentSession();
  const supabase = await supabaseServer();

  const [{ data: company }, { data: brand }, { data: mailbox }] = await Promise.all([
    supabase
      .from("companies")
      .select("tone_settings")
      .eq("id", session!.companyId)
      .single(),
    supabase
      .from("company_brand")
      .select("*")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    supabase
      .from("mailbox_connections")
      .select("email_address, status, last_synced_at, initial_fetch_from")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">
            Postkasse, merkevare og tone for tilbudsagenten. Selskap og
            medlemmer ligger under Selskap.
          </p>
        </div>
      </div>

      {params.koblet && (
        <div className="banner success">Koblet til {params.koblet}.</div>
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
                {!mailbox.last_synced_at && (
                  <FirstFetchFrom
                    value={(mailbox.initial_fetch_from ?? new Date().toISOString()).slice(
                      0,
                      10,
                    )}
                  />
                )}
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

        <SettingsForm
          company={{ tone_settings: company?.tone_settings ?? {} }}
          brand={brand ?? null}
        />
      </div>
    </>
  );
}
