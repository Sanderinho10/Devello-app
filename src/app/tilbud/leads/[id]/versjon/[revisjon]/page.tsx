import Link from "next/link";
import { notFound } from "next/navigation";
import {
  hentSendteVersjoner,
  sammenlign,
  type PostEndring,
  type SendtVersjon,
} from "@/lib/drafts/historikk";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import {
  computeTotals,
  formatDate,
  formatNok,
  harRabatt,
  hasDocument,
  lineDiscount,
  lineTotal,
  QUOTE_TYPE_LABELS,
  type QuoteLine,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Én sendt versjon av tilbudet, skrivebeskyttet — slik den så ut i programmet
 * da den gikk ut. Endringene fra forrige versjon står øverst, fordi det er det
 * man oftest leter etter.
 */
export default async function VersjonPage({
  params,
}: {
  params: Promise<{ id: string; revisjon: string }>;
}) {
  const { id, revisjon: revisjonTekst } = await params;
  const revisjon = Number(revisjonTekst);
  const supabase = await supabaseServer();

  // Brukerens tilgang: finner de ikke leadet, hører det til et annet selskap.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, subject")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: draft } = await supabase
    .from("drafts")
    .select("id, revisjon, sent_at, forrige_sendt_at, pdf_path, quote_no")
    .eq("lead_id", id)
    .maybeSingle();
  if (!draft) notFound();

  const versjoner = await hentSendteVersjoner(supabaseAdmin(), draft);
  const versjon = versjoner.find((v) => v.revisjon === revisjon);
  if (!versjon) notFound();
  const forrige = versjoner.find((v) => v.revisjon === revisjon - 1) ?? null;

  const pdfHref = `/api/drafts/${draft.id}/versjoner/${revisjon}/pdf`;
  const harPdf = hasDocument(versjon.quoteType) && Boolean(versjon.pdfPath || versjon.document);

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <Link className="tilbake" href={`/tilbud/leads/${id}`}>
            ← Tilbake til tilbudet
          </Link>
          <h1>
            {draft.quote_no ? <span className="muted">Tilbud {draft.quote_no} · </span> : null}
            Versjon {revisjon}
          </h1>
          <p className="page-subtitle">
            {[
              lead.subject || "(uten emne)",
              versjon.sendtAt
                ? `Sendt ${formatDate(versjon.sendtAt)}`
                : `Bekreftet ${formatDate(versjon.bekreftetAt)}`,
              QUOTE_TYPE_LABELS[versjon.quoteType],
            ].join(" · ")}
          </p>
        </div>
        {harPdf && (
          <div className="versjon-knapper">
            <a className="button secondary" href={pdfHref} target="_blank" rel="noreferrer">
              Åpne PDF
            </a>
            <a className="button" href={`${pdfHref}?last_ned=1`}>
              Last ned PDF
            </a>
          </div>
        )}
      </div>

      {versjoner.length > 1 && (
        <nav className="versjon-faner" aria-label="Versjoner">
          {versjoner.map((v) => (
            <Link
              key={v.id}
              href={`/tilbud/leads/${id}/versjon/${v.revisjon}`}
              className={`versjon-fane${v.revisjon === revisjon ? " aktiv" : ""}`}
              aria-current={v.revisjon === revisjon ? "page" : undefined}
            >
              Versjon {v.revisjon}
            </Link>
          ))}
          {!draft.sent_at && (
            <Link href={`/tilbud/leads/${id}`} className="versjon-fane">
              Versjon {draft.revisjon} (utkast)
            </Link>
          )}
        </nav>
      )}

      <div className="banner info" style={{ marginBottom: 18 }}>
        Dette er versjon {revisjon} slik den ble sendt til kunden. Den kan ikke endres
        {revisjon < draft.revisjon ? ` — gjeldende versjon er ${draft.revisjon}` : ""}.
      </div>

      <div className="stack">
        {forrige && <Endringer forrige={forrige} denne={versjon} />}
        <Dokument versjon={versjon} />
        <Epost versjon={versjon} />
      </div>
    </>
  );
}

function Endringer({ forrige, denne }: { forrige: SendtVersjon; denne: SendtVersjon }) {
  const e = sammenlign(forrige, denne);
  const differanse = e.totalEtter - e.totalFor;
  const ingenting =
    e.poster.length === 0 &&
    !e.tittel &&
    e.forutsetninger.lagtTil.length === 0 &&
    e.forutsetninger.fjernet.length === 0 &&
    !e.emne &&
    !e.tekst &&
    differanse === 0;

  return (
    <div className="card card-pad">
      <div className="inquiry-head">Endringer fra versjon {forrige.revisjon}</div>
      {ingenting ? (
        <p className="muted" style={{ margin: 0 }}>
          Innholdet er det samme som i versjon {forrige.revisjon}.
        </p>
      ) : (
        <>
          {forrige.total !== null && denne.total !== null && (
            <p className="versjon-total">
              Total inkl. mva: {formatNok(e.totalFor)} → <strong>{formatNok(e.totalEtter)}</strong>
              {differanse !== 0 && (
                <span className={differanse < 0 ? "endring-ned" : "endring-opp"}>
                  {" "}
                  ({differanse > 0 ? "+" : "−"}
                  {formatNok(Math.abs(differanse))})
                </span>
              )}
            </p>
          )}
          {e.poster.length > 0 && (
            <ul className="endringsliste">
              {e.poster.map((p, i) => (
                <li key={i} className={`endring-${p.type}`}>
                  <Postendring endring={p} />
                </li>
              ))}
            </ul>
          )}
          <ul className="endringsliste">
            {e.tittel && (
              <li>
                Tittel: «{e.tittel.for}» → «{e.tittel.etter}»
              </li>
            )}
            {e.forutsetninger.lagtTil.map((f) => (
              <li key={`+${f}`} className="endring-ny">
                Ny forutsetning: {f}
              </li>
            ))}
            {e.forutsetninger.fjernet.map((f) => (
              <li key={`-${f}`} className="endring-fjernet">
                Fjernet forutsetning: {f}
              </li>
            ))}
            {e.emne && <li>E-postemnet er endret.</li>}
            {e.tekst && <li>E-postteksten er endret.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function Postendring({ endring }: { endring: PostEndring }) {
  if (endring.type === "ny") {
    return (
      <>
        <span className="endring-merke">Ny</span> {endring.linje.description} —{" "}
        {antall(endring.linje)} · {formatNok(lineTotal(endring.linje))}
      </>
    );
  }
  if (endring.type === "fjernet") {
    return (
      <>
        <span className="endring-merke">Fjernet</span> {endring.linje.description} —{" "}
        {antall(endring.linje)} · {formatNok(lineTotal(endring.linje))}
      </>
    );
  }
  const { for: a, etter: b, felt } = endring;
  const deler: string[] = [];
  if (felt.includes("antall") || felt.includes("enhet")) deler.push(`${antall(a)} → ${antall(b)}`);
  if (felt.includes("pris")) deler.push(`pris ${formatNok(a.unit_price)} → ${formatNok(b.unit_price)}`);
  if (felt.includes("rabatt")) deler.push(`rabatt ${lineDiscount(a)} % → ${lineDiscount(b)} %`);
  if (felt.includes("tekst")) deler.push(`tekst var «${a.description}»`);
  return (
    <>
      <span className="endring-merke">Endret</span> {b.description} — {deler.join(", ")}
    </>
  );
}

function antall(l: QuoteLine): string {
  return `${l.quantity.toLocaleString("nb-NO")} ${l.unit}`;
}

function Dokument({ versjon }: { versjon: SendtVersjon }) {
  const doc = versjon.document;
  if (!hasDocument(versjon.quoteType) || !doc) return null;
  const totals = computeTotals(doc);
  const rabatt = harRabatt(doc);
  const kunde = [doc.customer.name, doc.customer.contact, doc.customer.email, doc.customer.phone, doc.customer.address]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="card card-pad">
      <div className="inquiry-head">Tilbudet</div>
      <h2 className="versjon-tittel">{doc.title}</h2>
      {kunde && <p className="muted" style={{ marginTop: 0 }}>{kunde}</p>}

      {doc.sections.map((seksjon, si) => (
        <div key={si} style={{ marginTop: 18 }}>
          {seksjon.title && <div className="versjon-seksjon">{seksjon.title}</div>}
          <div className="tabell-rull">
            <table className="doc-table versjon-tabell">
              <thead>
                <tr>
                  <th>Beskrivelse</th>
                  <th className="num">Antall</th>
                  <th>Enhet</th>
                  <th className="num">Pris</th>
                  {rabatt && <th className="num">Rabatt</th>}
                  <th className="num">Sum</th>
                </tr>
              </thead>
              <tbody>
                {seksjon.lines.map((l, li) => (
                  <tr key={li}>
                    <td>{l.description}</td>
                    <td className="num">{l.quantity.toLocaleString("nb-NO")}</td>
                    <td>{l.unit}</td>
                    <td className="num">{formatNok(l.unit_price)}</td>
                    {rabatt && <td className="num">{lineDiscount(l) ? `${lineDiscount(l)} %` : ""}</td>}
                    <td className="num">{formatNok(lineTotal(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="doc-totals" style={{ marginTop: 16 }}>
        <div className="doc-total-row">
          <span>Sum eks. mva</span>
          <span>{formatNok(totals.subtotal)}</span>
        </div>
        <div className="doc-total-row">
          <span>Mva {doc.vat_rate} %</span>
          <span>{formatNok(totals.vat)}</span>
        </div>
        <div className="doc-total-row grand">
          <span>Total</span>
          <span>{formatNok(totals.total)}</span>
        </div>
      </div>

      {doc.assumptions.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="versjon-seksjon">Forutsetninger</div>
          <ul className="versjon-forutsetninger">
            {doc.assumptions.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      {doc.valid_until && (
        <p className="muted tiny" style={{ marginBottom: 0 }}>
          Gyldig til {new Date(doc.valid_until).toLocaleDateString("nb-NO")}
        </p>
      )}
    </div>
  );
}

function Epost({ versjon }: { versjon: SendtVersjon }) {
  if (!versjon.emailSubject && !versjon.emailBody) return null;
  return (
    <div className="card card-pad">
      <div className="inquiry-head">E-posten</div>
      {versjon.emailSubject && <p style={{ marginTop: 0, fontWeight: 600 }}>{versjon.emailSubject}</p>}
      {versjon.emailBody && <div className="inquiry-body versjon-epost">{versjon.emailBody}</div>}
    </div>
  );
}
