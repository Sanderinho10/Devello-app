import { FirstFetchFrom } from "./FirstFetchFrom";
import { Panel } from "./Panel";
import { formatDate } from "@/lib/types";

export interface PostkasseRad {
  email_address: string;
  status: string;
  status_reason: string | null;
  last_synced_at: string | null;
  initial_fetch_from: string | null;
}

/** Postkassen tilbudsagenten leser fra og svarer via. Microsoft 365 / Outlook. */
export function Postkasse({ mailbox }: { mailbox: PostkasseRad | null }) {
  const aktiv = mailbox?.status === "aktiv";
  return (
    <>
      <Panel
        tittel="Microsoft 365 / Outlook"
        hint="Du samtykker selv ved tilkobling — det trengs ingen godkjenning fra IT-avdelingen."
        hoyre={
          mailbox ? (
            <span className={`pill ${aktiv ? "ferdig" : "sperret"}`}>{aktiv ? "Tilkoblet" : "Trenger ny tilkobling"}</span>
          ) : (
            <span className="pill utkast_klar">Ikke tilkoblet</span>
          )
        }
      >
        {mailbox ? (
          <dl className="inst-status">
            <dt>Postkasse</dt>
            <dd>
              <strong>{mailbox.email_address}</strong>
            </dd>
            <dt>Sist synkronisert</dt>
            <dd>{mailbox.last_synced_at ? formatDate(mailbox.last_synced_at) : "Ikke ennå"}</dd>
          </dl>
        ) : (
          <p className="muted" style={{ margin: "0 0 12px" }}>
            Ingen postkasse er tilkoblet. Uten postkasse kan dere fortsatt legge inn henvendelser for hånd.
          </p>
        )}
        {mailbox && !aktiv && mailbox.status_reason && <div className="banner error">{mailbox.status_reason}</div>}
        <div className="inst-knapper">
          <a className={`button${mailbox && aktiv ? " secondary" : ""}`} href={`/api/auth/microsoft/start${mailbox ? "?paanytt=1" : ""}`}>
            {mailbox ? "Koble til på nytt" : "Koble til Microsoft 365"}
          </a>
        </div>
        <p className="tiny muted" style={{ margin: "0 0 14px" }}>
          Appen ber om Mail.Read og Mail.ReadWrite. Den ber aldri om Mail.Send: vi lager kladder, du trykker send selv.
        </p>
      </Panel>

      {mailbox && !mailbox.last_synced_at && (
        <FirstFetchFrom value={(mailbox.initial_fetch_from ?? new Date().toISOString()).slice(0, 10)} />
      )}
    </>
  );
}
