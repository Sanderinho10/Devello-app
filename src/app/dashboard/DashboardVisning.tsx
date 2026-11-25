import Link from "next/link";
import type { DashDag, DashSoyle } from "./data";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { formatPrice } from "@/lib/billing/katalog";
import type { Oversikt } from "@/lib/billing/subscription";
import { HENDING_NAMN, type HendingType } from "@/lib/kalender/tid";
import { LEAD_STATUS_LABELS, ORDER_STATUS_LABELS, formatDate, type Lead, type Order } from "@/lib/types";

export type DashTone = "bla" | "gul" | "gronn" | "rod" | "gra";
export type DashSegment = { etikett: string; verdi: number; tone: DashTone };
/** Eit statuskort: hovudtalet, og korleis det som ligger fordeler seg. */
export type DashStatus = {
  tittel: string;
  href: string;
  verdi: number;
  tekst: string;
  detalj?: string;
  /** Står i stolpen når alle segmenta er null. */
  tom: string;
  segment: DashSegment[];
};
export type DashLead = Pick<Lead, "id" | "from_name" | "from_email" | "subject" | "status" | "received_at" | "created_at">;
export type DashOrdre = Pick<Order, "id" | "order_no" | "title" | "customer_name" | "status" | "created_at">;

const MAKS_PER_DAG = 3;

/** Dashboardet uten datahenting — så det kan vises med eksempeldata. */
export function DashboardVisning({
  selskap,
  ordre,
  status,
  kalender,
  leads,
  ordrer,
  oversikt,
  aktivitet,
  framdrift,
}: {
  selskap: string;
  ordre: boolean;
  status: DashStatus[];
  /** Null når selskapet ikke har kalender (ordremodulen). */
  kalender: DashDag[] | null;
  leads: DashLead[];
  ordrer: DashOrdre[];
  oversikt: Pick<Oversikt, "forbruk" | "abonnement" | "pakke" | "kostnad" | "bedrePakke" | "periode">;
  aktivitet: DashSoyle[];
  framdrift: { dag: number; dagar: number; igjen: number; del: number };
}) {
  const { forbruk, abonnement, pakke, kostnad, periode, bedrePakke } = oversikt;
  const erMikro = abonnement?.interval === "aar";
  const typar = kalender ? ([...new Set(kalender.flatMap((d) => d.hendingar.map((h) => h.kind)))] as HendingType[]) : [];

  // Kroner per del av regninga. Uten inkluderte enheter kan forbruket deles
  // på tilbud og faktura; med inkluderte er det bare overskytende som koster.
  const delt = abonnement && !abonnement.includedUnits;
  const kostnadsdelar = kostnad
    ? [
        { etikett: "Grunnpris", kr: kostnad.grunnpris, tone: "grunn" },
        ...(delt
          ? [
              { etikett: "Tilbud", kr: forbruk.tilbud * abonnement.unitPriceNok.tilbud, tone: "tilbud" },
              { etikett: "Fakturaer", kr: forbruk.faktura * abonnement.unitPriceNok.faktura, tone: "faktura" },
            ]
          : [{ etikett: "Enheter over inkludert", kr: kostnad.einingar, tone: "tilbud" }]),
        { etikett: "Montører i appen", kr: kostnad.appBrukarar, tone: "montor" },
      ]
    : [];

  return (
    <>
      <div className="page-header kompakt">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">{selskap}</p>
        </div>
      </div>

      <div className="dash-status">
        {status.map((s) => (
          <Link key={s.tittel} href={s.href} className="card dash-status-kort">
            <span className="dash-tal-etikett">{s.tittel}</span>
            <span className="dash-status-hoved">
              <span className="dash-tal-verdi">{s.verdi.toLocaleString("nb-NO")}</span>
              <span className="muted">{s.tekst}</span>
            </span>
            <Segmentstolpe segment={s.segment} tom={s.tom} />
            {s.detalj && <span className="tiny muted dash-status-detalj">{s.detalj}</span>}
          </Link>
        ))}
      </div>

      {kalender && (
        <section className="card dash-kalender">
          <div className="dash-kort-topp">
            <strong>Kalender</strong>
            <span className="tiny muted">De neste 7 dagene</span>
            {typar.length > 0 && (
              <span className="dash-forklaring">
                {typar.map((t) => (
                  <span key={t} className="tiny muted">
                    <span className={`kal-prikk ${t}`} /> {HENDING_NAMN[t]}
                  </span>
                ))}
              </span>
            )}
            <Link href="/kalender" className="lenke tiny dash-hoyre">
              Åpne kalenderen →
            </Link>
          </div>
          <div className="dash-kal">
            {kalender.map((d) => (
              <Link
                key={d.dato}
                href={`/kalender?uke=${d.dato}`}
                className={`dash-kal-dag${d.idag ? " idag" : ""}${d.helg ? " helg" : ""}`}
              >
                <span className="dash-kal-hode">
                  <span className="dash-kal-vekedag">{d.idag ? "I dag" : d.vekedag}</span>
                  <span className="dash-kal-dato">{d.dag}</span>
                </span>
                {d.hendingar.length > 0 && (
                  <span className="kal-side-om-side">
                    {d.hendingar.slice(0, MAKS_PER_DAG).map((h) => (
                      <span key={h.id} className={`kal-brikke ${h.kind}`} title={[h.tittel, h.kven].filter(Boolean).join(" · ")}>
                        <span className="kal-brikke-tid">{h.tid}</span>
                        <span className="kal-brikke-tittel">
                          {h.ordreNr !== null && <span className="kal-ordrenr">#{h.ordreNr} </span>}
                          {h.tittel}
                        </span>
                        {h.kven && <span className="kal-brikke-stad">{h.kven}</span>}
                      </span>
                    ))}
                  </span>
                )}
                {d.hendingar.length > MAKS_PER_DAG && (
                  <span className="tiny muted">+{d.hendingar.length - MAKS_PER_DAG} til</span>
                )}
                {d.hendingar.length === 0 && <span className="dash-kal-ledig">Ingen avtaler</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

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
        <div className="dash-forbruk-kropp">
          <div className="dash-forbruk-diagram">
            <div className="dash-forklaring">
              <span className="tiny">
                <span className="dash-prikk tilbud" /> Tilbud generert <strong>{forbruk.tilbud.toLocaleString("nb-NO")}</strong>
              </span>
              <span className="tiny">
                <span className="dash-prikk faktura" /> Fakturaer overført <strong>{forbruk.faktura.toLocaleString("nb-NO")}</strong>
              </span>
            </div>
            <Aktivitetsdiagram soyler={aktivitet} perDag={!erMikro} />
          </div>

          <div className="dash-forbruk-side">
            <Maaler
              etikett="Perioden"
              verdi={`Dag ${framdrift.dag} av ${framdrift.dagar}`}
              del={framdrift.del}
              detalj={framdrift.igjen === 1 ? "1 dag igjen" : `${framdrift.igjen} dager igjen`}
              tone="noytral"
            />
            {abonnement && abonnement.includedUnits > 0 && (
              <Maaler
                etikett="Enheter brukt"
                verdi={`${forbruk.tilbud + forbruk.faktura} av ${abonnement.includedUnits}`}
                del={(forbruk.tilbud + forbruk.faktura) / abonnement.includedUnits}
                detalj={
                  forbruk.tilbud + forbruk.faktura > abonnement.includedUnits
                    ? `${forbruk.tilbud + forbruk.faktura - abonnement.includedUnits} over det inkluderte`
                    : `${abonnement.includedUnits - forbruk.tilbud - forbruk.faktura} igjen av det inkluderte`
                }
              />
            )}
            {abonnement && abonnement.includedAppUsers > 0 ? (
              <Maaler
                etikett={erMikro ? "Montører i appen denne måneden" : "Aktive montører i appen"}
                verdi={`${forbruk.appBrukarar} av ${abonnement.includedAppUsers} inkludert`}
                del={forbruk.appBrukarar / abonnement.includedAppUsers}
                detalj={
                  forbruk.appBrukarar > abonnement.includedAppUsers && abonnement.appUserPriceNok
                    ? `${forbruk.appBrukarar - abonnement.includedAppUsers} ekstra × ${formatPrice(abonnement.appUserPriceNok)}/mnd`
                    : undefined
                }
                tone="montor"
              />
            ) : (
              <div className="dash-maaler">
                <span className="dash-maaler-topp">
                  <span className="dash-tal-etikett">{erMikro ? "Montører i appen denne måneden" : "Aktive montører i appen"}</span>
                  <strong>{forbruk.appBrukarar.toLocaleString("nb-NO")}</strong>
                </span>
                {abonnement?.appUserPriceNok ? (
                  <span className="tiny muted">× {formatPrice(abonnement.appUserPriceNok)}/mnd</span>
                ) : null}
              </div>
            )}

            {kostnad && (
              <div className="dash-kostnad">
                <span className="dash-maaler-topp">
                  <span className="dash-tal-etikett">Estimert {erMikro ? "for året" : "for perioden"}</span>
                  <strong className="dash-kostnad-sum">{formatPrice(kostnad.sum)}</strong>
                </span>
                {kostnad.sum > 0 && (
                  <span className="dash-stolpe" aria-hidden="true">
                    {kostnadsdelar
                      .filter((k) => k.kr > 0)
                      .map((k) => (
                        <span key={k.etikett} className={`dash-seg ${k.tone}`} style={{ flexGrow: k.kr }} title={`${k.etikett}: ${formatPrice(k.kr)}`} />
                      ))}
                  </span>
                )}
                <ul className="dash-kostnad-liste">
                  {kostnadsdelar.map((k) => (
                    <li key={k.etikett} className={`tiny${k.kr > 0 ? "" : " muted"}`}>
                      <span>
                        <span className={`dash-prikk ${k.tone}`} /> {k.etikett}
                      </span>
                      <span>{formatPrice(k.kr)}</span>
                    </li>
                  ))}
                </ul>
                <span className="tiny muted">eks. mva</span>
              </div>
            )}
          </div>
        </div>
        {bedrePakke && (
          <p className="banner info" style={{ margin: "0 16px 16px" }}>
            Med dette forbruket ville dere spart <strong>{formatPrice(bedrePakke.sparerKrPerMaanad)} i måneden</strong> på{" "}
            <strong>{bedrePakke.pakke.name}</strong>.
          </p>
        )}
      </section>

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

    </>
  );
}

/** Fordelinga som éin stolpe med forklaring under. Grå og tom når ingenting ligger. */
function Segmentstolpe({ segment, tom }: { segment: DashSegment[]; tom: string }) {
  const sum = segment.reduce((s, x) => s + x.verdi, 0);
  return (
    <>
      <span className="dash-stolpe" aria-hidden="true">
        {segment
          .filter((x) => x.verdi > 0)
          .map((x) => (
            <span key={x.etikett} className={`dash-seg ${x.tone}`} style={{ flexGrow: x.verdi }} />
          ))}
      </span>
      {sum === 0 ? (
        <span className="tiny muted">{tom}</span>
      ) : (
        <span className="dash-forklaring">
          {segment.map((x) => (
            <span key={x.etikett} className={`tiny${x.verdi > 0 ? "" : " dash-null"}`}>
              <span className={`dash-prikk ${x.tone}`} /> {x.etikett} <strong>{x.verdi.toLocaleString("nb-NO")}</strong>
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/** Ei linje som fylles: «12 av 100», med detaljen under. */
function Maaler({
  etikett,
  verdi,
  del,
  detalj,
  tone = "tilbud",
}: {
  etikett: string;
  verdi: string;
  del: number;
  detalj?: string;
  tone?: string;
}) {
  const over = del > 1;
  return (
    <div className="dash-maaler">
      <span className="dash-maaler-topp">
        <span className="dash-tal-etikett">{etikett}</span>
        <strong>{verdi}</strong>
      </span>
      <span className="dash-spor" aria-hidden="true">
        <span className={`dash-fyll ${over ? "over" : tone}`} style={{ width: `${Math.min(1, Math.max(0, del)) * 100}%` }} />
      </span>
      {detalj && <span className="tiny muted">{detalj}</span>}
    </div>
  );
}

/** Pent rundt tak på aksen: 4, 5, 10, 20, 50 … */
function aksetak(maks: number): number {
  if (maks <= 4) return 4;
  const tiar = 10 ** Math.floor(Math.log10(maks));
  return [1, 2, 5, 10].map((f) => f * tiar).find((t) => t >= maks) ?? maks;
}

/** Tilbud og fakturaer per dag (eller måned) i perioden, stablet. */
function Aktivitetsdiagram({ soyler, perDag }: { soyler: DashSoyle[]; perDag: boolean }) {
  const tak = aksetak(Math.max(0, ...soyler.map((s) => s.tilbud + s.faktura)));
  const noIdx = soyler.findIndex((s) => s.no);
  const visNamn = (i: number) =>
    !perDag || i === 0 || i === soyler.length - 1 || (i === noIdx && i > 3 && i < soyler.length - 4);
  const sum = soyler.reduce((s, x) => s + x.tilbud + x.faktura, 0);
  return (
    <div
      className="dash-diagram"
      role="img"
      aria-label={`${sum} tilbud og fakturaer fordelt på ${soyler.length} ${perDag ? "dager" : "måneder"}`}
    >
      <div className="dash-akse" aria-hidden="true">
        <span>{tak}</span>
        <span>{tak / 2}</span>
        <span>0</span>
      </div>
      <div className="dash-flate">
        <div className="dash-soyler">
          {soyler.map((s, i) => (
            <div
              key={i}
              className={`dash-soyle${s.framtid ? " framtid" : ""}${s.no ? " no" : ""}`}
              title={`${s.namn}: ${s.tilbud} tilbud, ${s.faktura} ${s.faktura === 1 ? "faktura" : "fakturaer"}`}
            >
              <div className="dash-soyle-stabel">
                {s.faktura > 0 && <span className="dash-bit faktura" style={{ height: `${(s.faktura / tak) * 100}%` }} />}
                {s.tilbud > 0 && <span className="dash-bit tilbud" style={{ height: `${(s.tilbud / tak) * 100}%` }} />}
              </div>
            </div>
          ))}
          {sum === 0 && <span className="dash-diagram-tom">Ingen tilbud eller fakturaer i perioden ennå</span>}
        </div>
        <div className="dash-x" aria-hidden="true">
          {soyler.map((s, i) => (
            <span key={i} className={s.no ? "no" : undefined}>
              {visNamn(i) && <span>{s.no && perDag ? "I dag" : s.kort}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function kortDato(d: Date): string {
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" }).format(d);
}
