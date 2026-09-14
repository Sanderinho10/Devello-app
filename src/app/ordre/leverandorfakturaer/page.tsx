import Link from "next/link";
import { FakturaListe } from "./FakturaListe";
import { HentFakturaer } from "@/components/HentFakturaer";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { SupplierInvoice, SupplierInvoiceLine } from "@/lib/types";

export const dynamic = "force-dynamic";

type Visning = "ukopla" | "kopla" | "alle";

/**
 * Leverandørfakturaene fra regnskapssystemet.
 *
 * «Ukoblet» er arbeidslista: fakturaer der ordrenummeret ikke ble funnet,
 * eller var tvetydig. Alt annet gikk av seg selv. Kreditnotaer står her
 * også — de kobles aldri automatisk.
 */
export default async function LeverandorfakturaerPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string }>;
}) {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const visRaa = (await searchParams).vis;
  const vis: Visning = visRaa === "kopla" || visRaa === "alle" ? visRaa : "ukopla";

  const [{ data: kopling }, { count: ukopla }, { count: kopla }, { count: alle }] =
    await Promise.all([
      supabase
        .from("accounting_connections")
        .select("id, status, last_sync_at, last_sync_note")
        .eq("company_id", session!.companyId)
        .maybeSingle(),
      supabase
        .from("supplier_invoices")
        .select("id", { count: "exact", head: true })
        .in("match_status", ["ukopla", "delvis"]),
      supabase
        .from("supplier_invoices")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "kopla"),
      supabase.from("supplier_invoices").select("id", { count: "exact", head: true }),
    ]);

  let sporring = supabase
    .from("supplier_invoices")
    .select("*")
    .order("voucher_date", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(200);
  if (vis === "ukopla") sporring = sporring.in("match_status", ["ukopla", "delvis"]);
  if (vis === "kopla") sporring = sporring.eq("match_status", "kopla");
  const { data: fakturaer } = await sporring;
  const liste = (fakturaer ?? []) as SupplierInvoice[];

  const [{ data: linjer }, { data: ordrar }] = await Promise.all([
    liste.length
      ? supabase
          .from("supplier_invoice_lines")
          .select("*")
          .in(
            "invoice_id",
            liste.map((f) => f.id),
          )
          .order("line_no")
      : Promise.resolve({ data: [] as SupplierInvoiceLine[] }),
    supabase
      .from("orders")
      .select("id, order_no, title, status, customer_name")
      .neq("status", "avbrutt")
      .order("order_no", { ascending: false })
      .limit(500),
  ]);

  const harKopling = Boolean(kopling && kopling.status !== "kopla_fra");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leverandørfakturaer</h1>
          <p className="page-subtitle">
            Fra regnskapssystemet, koblet til ordren grossisten skrev på fakturaen.
          </p>
        </div>
        {harKopling && <HentFakturaer />}
      </div>

      {!harKopling ? (
        <div className="card empty">
          <div className="empty-title">Ikke tilkoblet noe regnskapssystem</div>
          <div>
            Koble til PowerOffice Go under{" "}
            <Link href="/ordre/innstillinger" style={{ textDecoration: "underline" }}>
              Innstillinger
            </Link>
            , så hentes fakturaene hit.
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header row-between">
            <div className="type-switch kompakt">
              <Link href="/ordre/leverandorfakturaer" className={`type-option${vis === "ukopla" ? " active" : ""}`}>
                Ukoblet {ukopla ?? 0}
              </Link>
              <Link
                href="/ordre/leverandorfakturaer?vis=kopla"
                className={`type-option${vis === "kopla" ? " active" : ""}`}
              >
                Koblet {kopla ?? 0}
              </Link>
              <Link
                href="/ordre/leverandorfakturaer?vis=alle"
                className={`type-option${vis === "alle" ? " active" : ""}`}
              >
                Alle {alle ?? 0}
              </Link>
            </div>
            {kopling?.last_sync_note && <span className="tiny muted">{kopling.last_sync_note}</span>}
          </div>

          {liste.length === 0 ? (
            <div className="empty">
              <div className="empty-title">
                {vis === "ukopla" ? "Ingen ukoblede fakturaer" : "Ingen fakturaer ennå"}
              </div>
              <div>
                {vis === "ukopla"
                  ? "Alt som er hentet har funnet ordren sin."
                  : "Trykk «Hent fakturaer nå» for å lese inn fra regnskapssystemet."}
              </div>
            </div>
          ) : (
            <FakturaListe
              fakturaer={liste}
              linjer={(linjer ?? []) as SupplierInvoiceLine[]}
              ordrar={(ordrar ?? []).map((o) => ({
                id: o.id,
                order_no: o.order_no,
                title: o.title,
                status: o.status,
                customer_name: o.customer_name,
              }))}
            />
          )}
        </div>
      )}
    </>
  );
}
