import Link from "next/link";
import { NyKontakt } from "./NyKontakt";
import { kontakttypeTekst } from "./KontaktFelt";
import { supabaseServer } from "@/lib/supabase/server";
import { lesKontaktFilter, type KontaktFilter } from "@/lib/kunder/felt";
import { formatDate, type Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTER: { verdi: KontaktFilter; etikett: string }[] = [
  { verdi: "alle", etikett: "Alle" },
  { verdi: "kunder", etikett: "Kunder" },
  { verdi: "leverandorer", etikett: "Leverandører" },
];

/**
 * Kontaktregisteret: kunder og leverandører i samme liste.
 *
 * Én linje per kontakt, med hvor mange tilbud og ordrer som hører til.
 * Kundene fyller seg selv inn fra tilbud og ordrer; «Ny kontakt» er for
 * leverandørene og for den som vil ha kunden inn før første jobb. Søket går
 * på navn, e-post og kontaktperson, og kan snevres inn til kunder eller
 * leverandører.
 */
export default async function KontakterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const supabase = await supabaseServer();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = lesKontaktFilter(sp.type);

  let liste = supabase.from("customers").select("*").order("name").limit(500);
  if (q) {
    const monster = `%${q.replace(/[%_,()]/g, " ")}%`;
    liste = liste.or(`name.ilike.${monster},email.ilike.${monster},contact.ilike.${monster}`);
  }
  if (filter === "kunder") liste = liste.eq("is_customer", true);
  if (filter === "leverandorer") liste = liste.eq("is_supplier", true);

  const [{ data: rader }, { data: leads }, { data: ordrer }] = await Promise.all([
    liste,
    supabase.from("leads").select("customer_id").not("customer_id", "is", null),
    supabase.from("orders").select("customer_id").not("customer_id", "is", null),
  ]);

  const kontakter = (rader ?? []) as Customer[];
  const antallTilbud = tell(leads ?? []);
  const antallOrdrer = tell(ordrer ?? []);

  function lenke(type: KontaktFilter, medSok = true): string {
    const p = new URLSearchParams();
    if (q && medSok) p.set("q", q);
    if (type !== "alle") p.set("type", type);
    const s = p.toString();
    return s ? `/kontakter?${s}` : "/kontakter";
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Kontakter</h1>
          <p className="page-subtitle">Kunder og leverandører — med tilbud, ordrer og fakturaforslag samlet på kunden.</p>
        </div>
        <NyKontakt />
      </div>

      <div className="card">
        <div className="card-header row-between">
          <form method="get" className="row" style={{ flex: 1 }}>
            {filter !== "alle" && <input type="hidden" name="type" value={filter} />}
            <input
              className="input"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Søk på navn, e-post eller kontaktperson"
              aria-label="Søk i kontakter"
              style={{ maxWidth: 420 }}
            />
            {q && (
              <Link className="button ghost" href={lenke(filter, false)}>
                Nullstill
              </Link>
            )}
          </form>
          <span className="muted">{kontakter.length} kontakter</span>
        </div>

        <nav className="kontakt-filter" aria-label="Vis">
          {FILTER.map((f) => (
            <Link
              key={f.verdi}
              href={lenke(f.verdi)}
              className={`kontakt-filter-valg${f.verdi === filter ? " aktiv" : ""}`}
              aria-current={f.verdi === filter ? "page" : undefined}
            >
              {f.etikett}
            </Link>
          ))}
        </nav>

        {kontakter.length === 0 ? (
          <div className="empty">
            <div className="empty-title">
              {q ? "Ingen kontakter passer søket" : filter === "leverandorer" ? "Ingen leverandører ennå" : "Ingen kontakter ennå"}
            </div>
            <div>
              {q
                ? "Prøv et annet navn eller en annen e-postadresse."
                : filter === "leverandorer"
                  ? "Trykk «Ny kontakt» og kryss av for Leverandør."
                  : "Kunder kommer inn av seg selv fra tilbud og ordrer, eller trykk «Ny kontakt»."}
            </div>
          </div>
        ) : (
          <div className="lead-list">
            {kontakter.map((kontakt) => (
              <Link key={kontakt.id} href={`/kontakter/${kontakt.id}`} className="lead-row clickable">
                <div className="lead-main">
                  <div className="lead-subject" style={{ cursor: "inherit" }}>
                    {kontakt.name}
                  </div>
                  <div className="lead-meta">
                    {[kontakt.contact, kontakt.email, kontakt.phone].filter(Boolean).join(" · ") ||
                      "(ingen kontaktinfo)"}
                  </div>
                </div>
                <span className={`kontakt-merke${kontakt.is_supplier ? " leverandor" : ""}`}>
                  {kontakttypeTekst(kontakt)}
                </span>
                <span className="muted kunde-tall">
                  {kontakt.is_customer || antallTilbud.has(kontakt.id) || antallOrdrer.has(kontakt.id) ? (
                    <>
                      {teller(antallTilbud.get(kontakt.id) ?? 0, "tilbud", "tilbud")}
                      {" · "}
                      {teller(antallOrdrer.get(kontakt.id) ?? 0, "ordre", "ordrer")}
                    </>
                  ) : null}
                </span>
                <span className="lead-time">{formatDate(kontakt.created_at)}</span>
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
