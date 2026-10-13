import { FirstFetchFrom } from "./FirstFetchFrom";
import { formatDate } from "@/lib/types";

export interface PostkasseRad {
  email_address: string;
  status: string;
  status_reason: string | null;
  last_synced_at: string | null;
  initial_fetch_from: string | null;
}

/** Postkassen tilbudsagenten les frå og svarar via. Microsoft 365 / Outlook. */
export function Postkasse({ mailbox }: { mailbox: PostkasseRad | null }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <strong>Postkasse</strong>
          <div className="tiny muted">Microsoft 365 / Outlook</div>
        </div>
        <a className="button" href={`/api/auth/microsoft/start${mailbox ? "?paanytt=1" : ""}`}>
          {mailbox ? "Koble til på nytt" : "Koble til Microsoft 365"}
        </a>
      </div>
      <div className="card-pad">
        {mailbox ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row-between">
              <span>{mailbox.email_address}</span>
              <span className={`pill ${mailbox.status === "aktiv" ? "bekrefta" : "utkast_klar"}`}>
                {mailbox.status === "aktiv" ? "Aktiv" : "Trenger ny tilkobling"}
              </span>
            </div>
            {mailbox.status !== "aktiv" && mailbox.status_reason && (
              <div className="banner error" style={{ marginTop: 4 }}>
                {mailbox.status_reason}
              </div>
            )}
            <div className="tiny muted">Sist synkronisert: {formatDate(mailbox.last_synced_at)}</div>
            {!mailbox.last_synced_at && (
              <FirstFetchFrom
                value={(mailbox.initial_fetch_from ?? new Date().toISOString()).slice(0, 10)}
              />
            )}
          </div>
        ) : (
          <p className="muted">
            Ingen postkasse tilkoblet. Du samtykker selv ved tilkobling — det trengs
            ingen godkjenning fra IT-avdelingen.
          </p>
        )}
        <div className="tiny muted" style={{ marginTop: 14 }}>
          Appen ber om Mail.Read og Mail.ReadWrite. Den ber aldri om Mail.Send: vi
          lager kladder, du trykker send selv.
        </div>
      </div>
    </div>
  );
}
