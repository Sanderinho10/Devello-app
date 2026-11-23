import Link from "next/link";
import { NyOrdre } from "./NyOrdre";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { Sokefelt } from "@/components/Sokefelt";
import { SortKolonne } from "@/components/SortKolonne";
import { erHeltall, iListe, kunderSomPasser, lesSokeord, likeMonster } from "@/lib/sok";
import { lesSortering } from "@/lib/sortering";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  formatDate,
  formatNok,
  type Order,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const KOLONNER = ["nr", "tittel", "kunde", "adresse", "status", "sum", "opprettet"] as const;

const DB_KOLONNE: Record<(typeof KOLONNER)[number], string> = {
  nr: "order_no",
  tittel: "title",
  kunde: "customer_name",
  adresse: "site_address",
  status: "status",
  sum: "planned_total",
  opprettet: "created_at",
};

/**
 * Ordrelisten.
 *
 * Aktive ordrer er arbeidslisten; avsluttede er arkivet. Skillet går på om
 * det er noe igjen å gjøre på jobben, ikke på om den er betalt — en ferdig
 * ordre som venter på faktura hører til de avsluttede, for montøren er
 * ferdig med den.
 *
 * «Klare til fakturering» er kontorets liste: ordrene montøren har merket
 * ferdige, og som ikke er fakturert ennå — eldst ferdig først.
 */
export default async function OrdrePage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string; sort?: string; retning?: string; q?: string }>;
}) {
  const supabase = await supabaseServer();
  const sp = await searchParams;
  const avsluttede = sp.vis === "avsluttede";
  const klare = sp.vis === "klare";
  const vis = avsluttede ? "avsluttede" : klare ? "klare" : undefined;
  const sortering = lesSortering(sp, KOLONNER, { kolonne: "opprettet", stigende: false });
  const q = lesSokeord(sp.q);

  // Søket: ordrens egne felt, ordrenummeret når søket er et tall, og kunden
  // (navn eller kundenummer) via registeret. Gjelder listen og tallene i fanene.
  let sokefilter: string | null = null;
  if (q) {
    const monster = likeMonster(q);
    const kunder = await kunderSomPasser(supabase, q);
    sokefilter = [
      ...["title", "customer_name", "customer_contact", "customer_email", "customer_phone", "site_address"].map(
        (k) => `${k}.ilike.${monster}`,
      ),
      ...(erHeltall(q) ? [`order_no.eq.${q}`] : []),
      ...iListe("customer_id", kunder),
    ].join(",");
  }
  const medSok = <T extends { or: (f: string) => T }>(sporring: T): T => (sokefilter ? sporring.or(sokefilter) : sporring);

  // PostgREST vil ha «in»-listen som «(a,b)» i not-varianten.
  const aktivListe = `(${ORDER_ACTIVE_STATUSES.join(",")})`;
  const liste = medSok(supabase.from("orders").select("*, customers(customer_no)"));

  const [{ data: rader }, { count: ferdige }, { count: aktive }, { count: lukkede }] = await Promise.all([
    (klare
      ? liste.eq("status", "ferdig")
      : avsluttede
        ? liste.not("status", "in", aktivListe)
        : liste.in("status", ORDER_ACTIVE_STATUSES)
    )
      .order(DB_KOLONNE[sortering.kolonne], { ascending: sortering.stigende, nullsFirst: false })
      .limit(200),
    medSok(supabase.from("orders").select("id", { count: "exact", head: true })).eq("status", "ferdig"),
    medSok(supabase.from("orders").select("id", { count: "exact", head: true })).in("status", ORDER_ACTIVE_STATUSES),
    medSok(supabase.from("orders").select("id", { count: "exact", head: true })).not("status", "in", aktivListe),
  ]);

  const ordrer = (rader ?? []) as (Order & { customers: { customer_no: number } | null })[];
  const sortParams = { vis, q: q || undefined };
  const fane = (v: string | undefined) => `/ordre${v ? `?vis=${v}` : ""}${q ? `${v ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;

  // Fakturerte ordrer viser ordrenummeret i regnskapssystemet.
  const goNr = new Map<string, string>();
  const fakturerte = ordrer.filter((o) => o.status === "fakturert").map((o) => o.id);
  if (fakturerte.length) {
    const { data: utkast } = await supabase
      .from("invoice_drafts")
      .select("order_id, transfer_order_no, transfer_external_id")
      .in("order_id", fakturerte)
      .eq("status", "overfort");
    for (const u of utkast ?? []) {
      if (u.transfer_order_no ?? u.transfer_external_id) goNr.set(u.order_id, u.transfer_order_no ?? "");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ordrer</h1>
        </div>
      </div>

      <nav className="type-switch kompakt" aria-label="Vis">
        <Link href={fane(undefined)} className={`type-option${vis ? "" : " active"}`}>
          Aktive<span className="fane-tal">{aktive ?? 0}</span>
        </Link>
        <Link
          href={fane("klare")}
          className={`type-option${klare ? " active" : ""}`}
          title="Ordrer montøren har merket ferdige, som ikke er fakturert"
        >
          Klare til fakturering<span className="fane-tal">{ferdige ?? 0}</span>
        </Link>
        <Link href={fane("avsluttede")} className={`type-option${avsluttede ? " active" : ""}`}>
          Avsluttede<span className="fane-tal">{lukkede ?? 0}</span>
        </Link>
      </nav>

      <div className="verktoylinje">
        <NyOrdre />
        <Sokefelt
          q={q}
          behold={{ vis, sort: sp.sort, retning: sp.retning }}
          nullstill={vis ? `/ordre?vis=${vis}` : "/ordre"}
          tittel="Søk på ordrenummer, tittel, kunde, kundenummer, telefon, e-post eller adresse"
          etikett="Søk i ordrer"
          foran={q ? <span className="muted tiny">{ordrer.length} treff</span> : null}
        />
      </div>

      <div className="card">
        {ordrer.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {q
                ? "Ingen ordrer passer søket"
                : klare
                  ? "Ingen ordrer venter på faktura"
                  : avsluttede
                    ? "Ingen avsluttede ordrer ennå"
                    : "Ingen ordrer ennå"}
            </div>
            <div>
              {q
                ? "Se også de andre fanene — tallet i fanen viser treffene der."
                : klare
                ? "Når montøren trykker «Merk som ferdig», havner ordren her til den er fakturert."
                : avsluttede
                ? "Ordrer havner her når de er ferdige, fakturert eller avbrutt."
                : "Opprett en ordre fra et bekreftet tilbud, eller trykk «Ny ordre» for en jobb uten tilbud."}
            </div>
          </div>
        ) : (
          <div className="tabell-rull">
            <table className="table klikkbar">
              <thead>
                <tr>
                  <SortKolonne kolonne="nr" sortering={sortering} sti="/ordre" params={sortParams}>
                    Nr
                  </SortKolonne>
                  <SortKolonne kolonne="tittel" sortering={sortering} sti="/ordre" params={sortParams}>
                    Tittel
                  </SortKolonne>
                  <th>Kundenr.</th>
                  <SortKolonne kolonne="kunde" sortering={sortering} sti="/ordre" params={sortParams}>
                    Kunde
                  </SortKolonne>
                  <SortKolonne kolonne="adresse" sortering={sortering} sti="/ordre" params={sortParams}>
                    Adresse
                  </SortKolonne>
                  <SortKolonne kolonne="status" sortering={sortering} sti="/ordre" params={sortParams}>
                    Status
                  </SortKolonne>
                  <th>Type</th>
                  {klare && <th className="num">Ferdig</th>}
                  <SortKolonne kolonne="sum" sortering={sortering} sti="/ordre" params={sortParams} className="num">
                    Planlagt sum
                  </SortKolonne>
                  <SortKolonne kolonne="opprettet" sortering={sortering} sti="/ordre" params={sortParams} className="num">
                    Opprettet
                  </SortKolonne>
                </tr>
              </thead>
              <tbody>
                {ordrer.map((ordre) => (
                  <KlikkbarRad key={ordre.id} href={`/ordre/${ordre.id}`}>
                    <td className="ordre-nr">{ordre.order_no}</td>
                    <td>
                      <Link className="lenke" href={`/ordre/${ordre.id}`}>
                        {ordre.title}
                      </Link>
                    </td>
                    <td className="muted nowrap">{ordre.customers?.customer_no}</td>
                    <td>{ordre.customer_name}</td>
                    <td className="muted">{ordre.site_address}</td>
                    <td>
                      <span
                        className={`pill ${ordre.status}`}
                        title={goNr.has(ordre.id) ? "Ordreutkast i regnskapssystemet" : undefined}
                      >
                        {ORDER_STATUS_LABELS[ordre.status]}
                        {goNr.get(ordre.id) && ` · Go ${goNr.get(ordre.id)}`}
                      </span>
                    </td>
                    <td className="muted nowrap">{ordre.order_type ? ORDER_TYPE_LABELS[ordre.order_type] : ""}</td>
                    {klare && (
                      <td className="num nowrap">
                        {ordre.closed_at ? formatDate(ordre.closed_at) : ""}{" "}
                        <Link className="lenke" href={`/ordre/${ordre.id}/faktura`}>
                          Fakturer →
                        </Link>
                      </td>
                    )}
                    <td className="num nowrap">
                      {ordre.planned_total === null ? "—" : formatNok(Number(ordre.planned_total))}
                    </td>
                    <td className="num muted nowrap">{formatDate(ordre.created_at)}</td>
                  </KlikkbarRad>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
