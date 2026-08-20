import { FirstFetchFrom } from "./FirstFetchFrom";
import { Lessons, type LessonRow } from "./Lessons";
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

  const [{ data: company }, { data: brand }, { data: mailbox }, { data: lessons }, { data: me }] =
    await Promise.all([
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
      .select("email_address, status, status_reason, last_synced_at, initial_fetch_from")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
    // Bare dette selskapets lærdommer — RLS holder dem fra hverandre, og
    // spørringen sier det samme én gang til.
    supabase
      .from("agent_lessons")
      .select("id, regel, begrunnelse, quote_type, status, ganger, created_at")
      .eq("company_id", session!.companyId)
      .in("status", ["foreslaatt", "aktiv"])
      .order("created_at", { ascending: false }),
    supabase.from("users").select("role").eq("id", session!.userId).single(),
  ]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Innstillinger</h1>
          <p className="page-subtitle">
            Postkassen tilbudene svarer fra, og teksten agenten skriver.
            Logo, farge og adresse ligger under Selskap.
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
            <a
              className="button"
              href={`/api/auth/microsoft/start${mailbox ? "?paanytt=1" : ""}`}
            >
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
                {mailbox.status !== "aktiv" && mailbox.status_reason && (
                  <div className="banner error" style={{ marginTop: 4 }}>
                    {mailbox.status_reason}
                  </div>
                )}
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

        <Lessons
          lessons={(lessons ?? []) as LessonRow[]}
          isAdmin={me?.role === "admin"}
        />

        <SettingsForm
          company={{ tone_settings: company?.tone_settings ?? {} }}
          brand={brand ?? null}
        />
      </div>
    </>
  );
}
