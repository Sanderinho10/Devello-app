import Link from "next/link";
import { NyKunde } from "./NyKunde";
import { supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Kunderegisteret.
 *
 * Én linje per kunde med hvor mange tilbud og ordrer som hører til. Listen
 * fyller seg selv: kunder oppstår fra tilbud og ordrer, og «Ny kunde» er for
 * den som vil ha kunden inn før første jobb. Søket går på navn, e-post og
 * kontaktperson.
 */
export default async function KunderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await supabaseServer();
  const q = ((await searchParams).q ?? "").trim();

  let liste = supabase.from("customers").select("*").order("name").limit(500);
  if (q) {
    const monster = `%${q.replace(/[%_,()]/g, " ")}%`;
    liste = liste.or(`name.ilike.${monster},email.ilike.${monster},contact.ilike.${monster}`);
  }

  const [{ data: rader }, { data: leads }, { data: ordrer }] = await Promise.all([
    liste,
    supabase.from("leads").select("customer_id").not("customer_id", "is", null),
    supabase.from("orders").select("customer_id").not("customer_id", "is", null),
  ]);

  const kunder = (rader ?? []) as Customer[];
  const antallTilbud = tell(leads ?? []);
  const antallOrdrer = tell(ordrer ?? []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Kunder</h1>
          <p className="page-subtitle">Alle tilbud, ordrer og fakturaforslag samlet på kunden.</p>
        </div>
        <NyKunde />
      </div>

      <div className="card">
        <div className="card-header row-between">
          <form method="get" className="row" style={{ flex: 1 }}>
            <input
              className="input"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Søk på navn, e-post eller kontaktperson"
              aria-label="Søk i kunder"
              style={{ maxWidth: 420 }}
            />
            {q && (
              <Link className="button ghost" href="/kunder">
                Nullstill
              </Link>
            )}
          </form>
          <span className="muted">{kunder.length} kunder</span>
        </div>

        {kunder.length === 0 ? (
          <div className="empty">
            <div className="empty-title">{q ? "Ingen kunder passer søket" : "Ingen kunder ennå"}</div>
            <div>
              {q
                ? "Prøv et annet navn eller en annen e-postadresse."
                : "Kunder kommer inn av seg selv fra tilbud og ordrer, eller trykk «Ny kunde»."}
            </div>
          </div>
        ) : (
          <div className="lead-list">
            {kunder.map((kunde) => (
              <Link key={kunde.id} href={`/kunder/${kunde.id}`} className="lead-row clickable">
                <div className="lead-main">
                  <div className="lead-subject" style={{ cursor: "inherit" }}>
                    {kunde.name}
                  </div>
                  <div className="lead-meta">
                    {[kunde.contact, kunde.email, kunde.phone].filter(Boolean).join(" · ") ||
                      "(ingen kontaktinfo)"}
                  </div>
                </div>
                <span className="muted kunde-tall">
                  {teller(antallTilbud.get(kunde.id) ?? 0, "tilbud", "tilbud")}
                  {" · "}
                  {teller(antallOrdrer.get(kunde.id) ?? 0, "ordre", "ordrer")}
                </span>
                <span className="lead-time">{formatDate(kunde.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function tell(rader: { customer_id: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rader) {
    if (r.customer_id) m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + 1);
  }
  return m;
}

function teller(n: number, ein: string, fleire: string): string {
  return `${n} ${n === 1 ? ein : fleire}`;
}
