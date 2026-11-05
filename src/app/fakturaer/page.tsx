import Link from "next/link";
import { NyFaktura } from "./NyFaktura";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { Sokefelt } from "@/components/Sokefelt";
import { SortKolonne } from "@/components/SortKolonne";
import { erHeltall, iListe, kunderSomPasser, lesSokeord, likeMonster } from "@/lib/sok";
import { lesSortering } from "@/lib/sortering";
import { supabaseServer } from "@/lib/supabase/server";
import { INVOICE_DRAFT_STATUS_LABELS, formatDate, formatNok, type InvoiceDraft, type InvoiceDraftStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const KOLONNER = ["tittel", "status", "dato"] as const;

/** «dato» er når fakturaen ble overført i den fanen, ellers når den ble opprettet. */
function dbKolonne(kolonne: (typeof KOLONNER)[number], overforte: boolean): string {
  if (kolonne === "tittel") return "title";
  if (kolonne === "status") return "status";
  return overforte ? "transferred_at" : "created_at";
}

const UTKAST_STATUSER: InvoiceDraftStatus[] = ["utkast", "godkjent", "feil"];

type Rad = InvoiceDraft & {
  orders: { order_no: number; title: string; customer_name: string } | null;
  customers: { name: string; customer_no: number | null } | null;
};

/**
 * Fakturalisten.
 *
 * Utkast er arbeidslisten: fakturaer som ikke er overført ennå — forslag
 * på ordrer og fakturaer laget rett her. Overførte er arkivet: de ligger
 * som ordreutkast i regnskapssystemet og sendes derfra. Devello sender
 * aldri en faktura selv.
 */
export default async function FakturaerPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string; sort?: string; retning?: string; q?: string }>;
}) {
  const supabase = await supabaseServer();
  const sp = await searchParams;
  const overforte = sp.vis === "overforte";
  const sortering = lesSortering(sp, KOLONNER, { kolonne: "dato", stigende: false });
  const q = lesSokeord(sp.q);

  // Søket: fakturaens egne felt, kunden i registeret, og ordren den er laget
  // fra (nummer, tittel eller kunde). Gjelder listen og tallene i fanene.
  let sokefilter: string | null = null;
  if (q) {
    const monster = likeMonster(q);
    const ordreFilter = [
      `title.ilike.${monster}`,
      `customer_name.ilike.${monster}`,
      ...(erHeltall(q) ? [`order_no.eq.${q}`] : []),
    ].join(",");
    const [kunder, { data: ordrer }] = await Promise.all([
      kunderSomPasser(supabase, q),
      supabase.from("orders").select("id").or(ordreFilter).limit(200),
    ]);
    sokefilter = [
      ...["title", "customer_name", "invoice_text", "transfer_order_no"].map((k) => `${k}.ilike.${monster}`),
      ...iListe("customer_id", kunder),
      ...iListe("order_id", (ordrer ?? []).map((o) => o.id as string)),
    ].join(",");
  }
  const medSok = <T extends { or: (f: string) => T }>(sporring: T): T => (sokefilter ? sporring.or(sokefilter) : sporring);

  const liste = medSok(
    supabase.from("invoice_drafts").select("*, orders(order_no, title, customer_name), customers(name, customer_no)"),
  );
  const [{ data: rader }, { count: antallUtkast }, { count: antallOverforte }] = await Promise.all([
    (overforte ? liste.eq("status", "overfort") : liste.in("status", UTKAST_STATUSER))
      .order(dbKolonne(sortering.kolonne, overforte), { ascending: sortering.stigende, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200),
    medSok(supabase.from("invoice_drafts").select("id", { count: "exact", head: true })).in("status", UTKAST_STATUSER),
    medSok(supabase.from("invoice_drafts").select("id", { count: "exact", head: true })).eq("status", "overfort"),
  ]);

  const fakturaer = (rader ?? []) as Rad[];
  const sortParams = { vis: overforte ? "overforte" : undefined, q: q || undefined };
  const sti = "/fakturaer";

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Fakturaer</h1>
          <p className="page-subtitle">
            Fra ordrene, eller laget rett her. Overførte fakturaer ligger som ordreutkast i regnskapssystemet og sendes derfra.
          </p>
        </div>
      </div>

      <nav className="type-switch kompakt" aria-label="Vis">
        <Link href={`${sti}${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`type-option${overforte ? "" : " active"}`}>
          Utkast<span className="fane-tal">{antallUtkast ?? 0}</span>
        </Link>
        <Link
          href={`${sti}?vis=overforte${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          className={`type-option${overforte ? " active" : ""}`}
        >
          Overført<span className="fane-tal">{antallOverforte ?? 0}</span>
        </Link>
      </nav>

      <div className="verktoylinje">
        <NyFaktura />
        <Sokefelt
          q={q}
          behold={{ vis: overforte ? "overforte" : undefined, sort: sp.sort, retning: sp.retning }}
          nullstill={overforte ? `${sti}?vis=overforte` : sti}
          tittel="Søk på tittel, kunde, kundenummer, ordrenummer eller nummeret i regnskapssystemet"
          etikett="Søk i fakturaer"
          foran={q ? <span className="muted tiny">{fakturaer.length} treff</span> : null}
        />
      </div>

      <div className="card">
        {fakturaer.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {q ? "Ingen fakturaer passer søket" : overforte ? "Ingen overførte fakturaer ennå" : "Ingen fakturautkast"}
            </div>
            <div>
              {q
                ? (overforte ? "Se også Utkast" : "Se også Overført") + " — tallet i fanen viser treffene der."
                : overforte
                  ? "Fakturaer havner her når de er overført til regnskapssystemet."
                  : "Lag et fakturaforslag fra en ordre, eller trykk «Ny faktura» for en faktura uten ordre."}
            </div>
          </div>
        ) : (
          <div className="tabell-rull">
            <table className="table klikkbar">
              <thead>
                <tr>
                  {overforte && <th>Nr.</th>}
                  <SortKolonne kolonne="tittel" sortering={sortering} sti={sti} params={sortParams}>
                    Tittel
                  </SortKolonne>
                  <th>Kundenr.</th>
                  <th>Kunde</th>
                  <th>Ordre</th>
                  <SortKolonne kolonne="status" sortering={sortering} sti={sti} params={sortParams}>
                    Status
                  </SortKolonne>
                  <th className="num">Sum inkl. mva</th>
                  <SortKolonne kolonne="dato" sortering={sortering} sti={sti} params={sortParams} className="num">
                    {overforte ? "Overført" : "Opprettet"}
                  </SortKolonne>
                </tr>
              </thead>
              <tbody>
                {fakturaer.map((f) => {
                  const href = f.order_id ? `/ordre/${f.order_id}/faktura` : `/fakturaer/${f.id}`;
                  const tittel = f.title || f.orders?.title || f.invoice_text || "Uten tittel";
                  const kunde = f.customers?.name || f.customer_name || f.orders?.customer_name || "—";
                  return (
                    <KlikkbarRad key={f.id} href={href}>
                      {overforte && <td className="ordre-nr">{f.transfer_order_no ?? "—"}</td>}
                      <td>
                        <Link className="lenke" href={href}>
                          {tittel}
                        </Link>
                      </td>
                      <td className="muted nowrap">{f.customers?.customer_no}</td>
                      <td>{kunde}</td>
                      <td className="muted nowrap">{f.orders ? `#${f.orders.order_no}` : "Uten ordre"}</td>
                      <td>
                        <span className={`pill ${statusKlasse(f.status)}`} title={f.transfer_error ?? undefined}>
                          {INVOICE_DRAFT_STATUS_LABELS[f.status]}
                        </span>
                      </td>
                      <td className="num nowrap">{formatNok(Number(f.totals?.total ?? 0))}</td>
                      <td className="num muted nowrap">{formatDate(overforte ? f.transferred_at : f.created_at)}</td>
                    </KlikkbarRad>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/** Samme farger som på fakturaen: godkjent og overført grønt, feil rødt. */
function statusKlasse(status: InvoiceDraftStatus): string {
  if (status === "godkjent" || status === "overfort") return "ferdig";
  if (status === "feil") return "avbrutt";
  return "opna";
}
