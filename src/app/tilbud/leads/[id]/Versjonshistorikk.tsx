import Link from "next/link";
import type { SendtVersjon } from "@/lib/drafts/historikk";
import { formatDate, formatNok, hasDocument } from "@/lib/types";

/**
 * Versjonene av tilbudet som er sendt, i sidespalten ved siden av utkastet.
 *
 * Når kunden ringer og spør «hva var det dere tilbød først?», skal svaret
 * ligge ett klikk unna — ikke i Sendte elementer i Outlook.
 */
export function Versjonshistorikk({
  leadId,
  draftId,
  versjoner,
  gjeldende,
}: {
  leadId: string;
  draftId: string;
  versjoner: SendtVersjon[];
  /** Versjonen som står i editoren nå, og om den er sendt. */
  gjeldende: { revisjon: number; sendt: boolean };
}) {
  if (versjoner.length === 0) return null;

  return (
    <div className="versjonshistorikk">
      <div className="inquiry-head">Versjoner · {versjoner.length} sendt</div>
      <ul>
        {[...versjoner].reverse().map((v) => {
          const harPdf = hasDocument(v.quoteType) && (v.pdfPath || v.document);
          return (
            <li key={v.id}>
              <Link className="versjon-rad" href={`/tilbud/leads/${leadId}/versjon/${v.revisjon}`}>
                <span className="versjon-navn">
                  Versjon {v.revisjon}
                  {v.revisjon === gjeldende.revisjon && gjeldende.sendt ? (
                    <span className="pill versjon">gjeldende</span>
                  ) : null}
                </span>
                <span className="versjon-meta">
                  {v.sendtAt ? `Sendt ${formatDate(v.sendtAt)}` : `Bekreftet ${formatDate(v.bekreftetAt)}`}
                  {v.total !== null ? ` · ${formatNok(v.total)}` : ""}
                </span>
              </Link>
              {harPdf ? (
                <a
                  className="versjon-pdf"
                  href={`/api/drafts/${draftId}/versjoner/${v.revisjon}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Åpne PDF-en for versjon ${v.revisjon}`}
                >
                  PDF
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!gjeldende.sendt && (
        <p className="muted tiny" style={{ margin: "8px 0 0" }}>
          Versjon {gjeldende.revisjon} er under arbeid i utkastet.
        </p>
      )}
    </div>
  );
}
