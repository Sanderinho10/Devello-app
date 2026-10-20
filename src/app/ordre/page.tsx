import Link from "next/link";
import { NyOrdre } from "./NyOrdre";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { SortKolonne } from "@/components/SortKolonne";
import { lesSortering } from "@/lib/sortering";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS_LABELS,
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
 */
export default async function OrdrePage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string; sort?: string; retning?: string }>;
}) {
  const supabase = await supabaseServer();
  const sp = await searchParams;
  const avsluttede = sp.vis === "avsluttede";
  const sortering = lesSortering(sp, KOLONNER, { kolonne: "opprettet", stigende: false });

  // PostgREST vil ha «in»-listen som «(a,b)» i not-varianten.
  const aktivListe = `(${ORDER_ACTIVE_STATUSES.join(",")})`;
  const liste = supabase.from("orders").select("*");

  const [{ data: rader }, { count: aktive }, { count: lukkede }] = await Promise.all([
    (avsluttede
      ? liste.not("status", "in", aktivListe)
      : liste.in("status", ORDER_ACTIVE_STATUSES)
    )
      .order(DB_KOLONNE[sortering.kolonne], { ascending: sortering.stigende, nullsFirst: false })
      .limit(200),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ORDER_ACTIVE_STATUSES),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("status", "in", aktivListe),
  ]);

  const ordrer = (rader ?? []) as Order[];
  const sortParams = { vis: avsluttede ? "avsluttede" : undefined };

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
          <p className="page-subtitle">Alt som skjer på en jobb, samlet på ett nummer.</p>
        </div>
      </div>

      <nav className="type-switch kompakt" aria-label="Vis">
        <Link href="/ordre" className={`type-option${avsluttede ? "" : " active"}`}>
          Aktive<span className="fane-tal">{aktive ?? 0}</span>
        </Link>
        <Link href="/ordre?vis=avsluttede" className={`type-option${avsluttede ? " active" : ""}`}>
          Avsluttede<span className="fane-tal">{lukkede ?? 0}</span>
        </Link>
      </nav>

      <div className="verktoylinje">
        <NyOrdre />
      </div>

      <div className="card">
        {ordrer.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {avsluttede ? "Ingen avsluttede ordrer ennå" : "Ingen ordrer ennå"}
            </div>
            <div>
              {avsluttede
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
                  <SortKolonne kolonne="kunde" sortering={sortering} sti="/ordre" params={sortParams}>
                    Kunde
                  </SortKolonne>
                  <SortKolonne kolonne="adresse" sortering={sortering} sti="/ordre" params={sortParams}>
                    Adresse
                  </SortKolonne>
                  <SortKolonne kolonne="status" sortering={sortering} sti="/ordre" params={sortParams}>
                    Status
                  </SortKolonne>
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
