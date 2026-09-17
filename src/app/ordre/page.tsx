import Link from "next/link";
import { NyOrdre } from "./NyOrdre";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_STATUS_LABELS,
  formatDate,
  formatNok,
  type Order,
} from "@/lib/types";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ vis?: string }>;
}) {
  const supabase = await supabaseServer();
  const avsluttede = (await searchParams).vis === "avsluttede";

  // PostgREST vil ha «in»-listen som «(a,b)» i not-varianten.
  const aktivListe = `(${ORDER_ACTIVE_STATUSES.join(",")})`;
  const liste = supabase.from("orders").select("*");

  const [{ data: rader }, { count: aktive }, { count: lukkede }] = await Promise.all([
    (avsluttede
      ? liste.not("status", "in", aktivListe)
      : liste.in("status", ORDER_ACTIVE_STATUSES)
    )
      .order("created_at", { ascending: false })
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
        <NyOrdre />
      </div>

      <div className="card">
        <div className="card-header row-between">
          <div className="type-switch kompakt">
            <Link href="/ordre" className={`type-option${avsluttede ? "" : " active"}`}>
              Aktive {aktive ?? 0}
            </Link>
            <Link
              href="/ordre?vis=avsluttede"
              className={`type-option${avsluttede ? " active" : ""}`}
            >
              Avsluttede {lukkede ?? 0}
            </Link>
          </div>
        </div>

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
          <div className="lead-list">
            {ordrer.map((ordre) => (
              <Link key={ordre.id} href={`/ordre/${ordre.id}`} className="lead-row clickable">
                <span className="ordre-nr">#{ordre.order_no}</span>
                <div className="lead-main">
                  <div className="lead-subject" style={{ cursor: "inherit" }}>
                    {ordre.title}
                  </div>
                  <div className="lead-meta">
                    {[ordre.customer_name, ordre.site_address].filter(Boolean).join(" · ") ||
                      "(ingen kunde)"}
                  </div>
                </div>
                <span className={`pill ${ordre.status}`} title={goNr.has(ordre.id) ? "Ordreutkast i regnskapssystemet" : undefined}>
                  {ORDER_STATUS_LABELS[ordre.status]}
                  {goNr.get(ordre.id) && ` · Go ${goNr.get(ordre.id)}`}
                </span>
                <span className="ordre-sum">
                  {ordre.planned_total === null ? "—" : formatNok(Number(ordre.planned_total))}
                </span>
                <span className="lead-time">{formatDate(ordre.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
