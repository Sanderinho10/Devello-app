import Link from "next/link";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { formatPrice } from "@/lib/billing/katalog";
import type { Oversikt } from "@/lib/billing/subscription";
import { LEAD_STATUS_LABELS, ORDER_STATUS_LABELS, formatDate, type Lead, type Order } from "@/lib/types";

export type DashTal = { etikett: string; verdi: number; href: string; hint: string; varsle?: boolean };
export type DashLead = Pick<Lead, "id" | "from_name" | "from_email" | "subject" | "status" | "received_at" | "created_at">;
export type DashOrdre = Pick<Order, "id" | "order_no" | "title" | "customer_name" | "status" | "created_at">;

/** Dashboardet uten datahenting — så det kan vises med eksempeldata. */
export function DashboardVisning({
  selskap,
  ordre,
  tal,
  leads,
  ordrer,
  oversikt,
}: {
  selskap: string;
  ordre: boolean;
  tal: DashTal[];
  leads: DashLead[];
  ordrer: DashOrdre[];
  oversikt: Pick<Oversikt, "forbruk" | "abonnement" | "pakke" | "kostnad" | "bedrePakke" | "periode">;
}) {
  const { forbruk, abonnement, pakke, kostnad, periode, bedrePakke } = oversikt;
  const erMikro = abonnement?.interval === "aar";
  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">{selskap}</p>
        </div>
      </div>

      <div className="dash-tal">
        {tal.map((t) => (
          <Link key={t.etikett} href={t.href} className={`card dash-tal-kort${t.varsle ? " varsle" : ""}`}>
            <span className="dash-tal-etikett">{t.etikett}</span>
            <span className="dash-tal-verdi">{t.verdi.toLocaleString("nb-NO")}</span>
            <span className="tiny muted">{t.hint}</span>
          </Link>
        ))}
      </div>

      <div className={`dash-grid${ordre ? "" : " en"}`}>
        <section className="card allow-overflow">
          <div className="dash-kort-topp">
            <strong>Siste henvendelser</strong>
            <Link href="/tilbud/leads" className="lenke tiny">
              Alle →
            </Link>
          </div>
          {leads.length === 0 ? (
            <p className="muted dash-tom">Ingen henvendelser i arbeid.</p>
          ) : (
            <table className="table klikkbar tabell-mobil">
              <tbody>
                {leads.map((l) => (
                  <KlikkbarRad key={l.id} href={`/tilbud/leads/${l.id}`}>
                    <td className="hoved">
                      <div className="dash-linje">{l.subject || "(uten emne)"}</div>
                      <div className="tiny muted">{l.from_name || l.from_email || "Ukjent avsender"}</div>
                    </td>
                    <td className="meta">
                      <span className={`pill ${l.status}`}>{LEAD_STATUS_LABELS[l.status]}</span>
                    </td>
                    <td className="meta tiny muted" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      {formatDate(l.received_at ?? l.created_at)}
                    </td>
                  </KlikkbarRad>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {ordre && (
          <section className="card allow-overflow">
            <div className="dash-kort-topp">
              <strong>Aktive ordrer</strong>
              <Link href="/ordre" className="lenke tiny">
                Alle →
              </Link>
            </div>
            {ordrer.length === 0 ? (
              <p className="muted dash-tom">Ingen aktive ordrer.</p>
            ) : (
              <table className="table klikkbar tabell-mobil">
                <tbody>
                  {ordrer.map((o) => (
                    <KlikkbarRad key={o.id} href={`/ordre/${o.id}`}>
                      <td className="hoved">
                        <div className="dash-linje">
                          <span className="muted">#{o.order_no}</span> {o.title}
                        </div>
                        <div className="tiny muted">{o.customer_name}</div>
                      </td>
                      <td className="meta">
                        <span className={`pill ${o.status}`}>{ORDER_STATUS_LABELS[o.status]}</span>
                      </td>
                      <td className="meta tiny muted" style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        {formatDate(o.created_at)}
                      </td>
                    </KlikkbarRad>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <section className="card allow-overflow dash-forbruk">
        <div className="dash-kort-topp">
          <strong>Forbruk {erMikro ? "i år" : "denne perioden"}</strong>
          <span className="tiny muted">
            {kortDato(periode.start)} – {kortDato(periode.slutt)}
            {pakke && ` · ${pakke.name}`}
          </span>
          <Link href="/selskap/abonnement" className="lenke tiny dash-hoyre">
            Abonnement →
          </Link>
        </div>
        <div className="dash-forbruk-tal">
          <Forbrukstal
            etikett="Tilbud generert"
            verdi={forbruk.tilbud}
            detalj={
              abonnement && !abonnement.includedUnits && abonnement.unitPriceNok.tilbud
                ? `× ${formatPrice(abonnement.unitPriceNok.tilbud)}`
                : undefined
            }
          />
          <Forbrukstal
            etikett="Fakturaer overført"
            verdi={forbruk.faktura}
            detalj={
              abonnement && !abonnement.includedUnits && abonnement.unitPriceNok.faktura
                ? `× ${formatPrice(abonnement.unitPriceNok.faktura)}`
                : undefined
            }
          />
          <Forbrukstal
            etikett={erMikro ? "Montører i appen denne måneden" : "Aktive montører i appen"}
            verdi={forbruk.appBrukarar}
            detalj={abonnement?.appUserPriceNok ? `× ${formatPrice(abonnement.appUserPriceNok)}/mnd` : undefined}
          />
          {abonnement && abonnement.includedUnits > 0 && (
            <Forbrukstal
              etikett="Enheter brukt"
              verdi={forbruk.tilbud + forbruk.faktura}
              detalj={`av ${abonnement.includedUnits} inkludert`}
            />
          )}
          {kostnad && (
            <div className="dash-forbruk-sum">
              <span className="dash-tal-etikett">Estimert {erMikro ? "for året" : "for perioden"}</span>
              <span className="dash-forbruk-verdi">{formatPrice(kostnad.sum)}</span>
              <span className="tiny muted">eks. mva · grunnpris {formatPrice(kostnad.grunnpris)}</span>
            </div>
          )}
        </div>
        {bedrePakke && (
          <p className="banner info" style={{ margin: "0 16px 16px" }}>
            Med dette forbruket ville dere spart <strong>{formatPrice(bedrePakke.sparerKrPerMaanad)} i måneden</strong> på{" "}
            <strong>{bedrePakke.pakke.name}</strong>.
          </p>
        )}
      </section>
    </>
  );
}

function Forbrukstal({ etikett, verdi, detalj }: { etikett: string; verdi: number; detalj?: string }) {
  return (
    <div className="dash-forbruk-celle">
      <span className="dash-tal-etikett">{etikett}</span>
      <span className="dash-forbruk-verdi">{verdi.toLocaleString("nb-NO")}</span>
      {detalj && <span className="tiny muted">{detalj}</span>}
    </div>
  );
}

function kortDato(d: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(d);
}
