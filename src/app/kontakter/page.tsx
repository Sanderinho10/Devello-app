import Link from "next/link";
import { NyKontakt } from "./NyKontakt";
import { KlikkbarRad } from "@/components/KlikkbarRad";
import { SortKolonne } from "@/components/SortKolonne";
import { lesSortering } from "@/lib/sortering";
import { kontakttypeTekst } from "./KontaktFelt";
import { supabaseServer } from "@/lib/supabase/server";
import { lesKontaktFilter, type KontaktFilter } from "@/lib/kunder/felt";
import { formatDate, type Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

const KOLONNER = ["navn", "kontaktperson", "telefon", "epost", "tilbud", "ordrer", "opprettet"] as const;

/** Kolonnen i databasen. Tilbud og ordrer telles og sorteres etter henting. */
const DB_KOLONNE: Record<(typeof KOLONNER)[number], string | null> = {
  navn: "name",
  kontaktperson: "contact",
  telefon: "phone",
  epost: "email",
  tilbud: null,
  ordrer: null,
  opprettet: "created_at",
};

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
  searchParams: Promise<{ q?: string; type?: string; sort?: string; retning?: string }>;
}) {
  const supabase = await supabaseServer();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter = lesKontaktFilter(sp.type);
  const sortering = lesSortering(sp, KOLONNER, { kolonne: "navn", stigende: true });

  const dbKolonne = DB_KOLONNE[sortering.kolonne];
  let liste = supabase
    .from("customers")
    .select("*")
    .order(dbKolonne ?? "name", { ascending: dbKolonne ? sortering.stigende : true, nullsFirst: false })
    .limit(500);
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
  // Antall tilbud og ordrer finnes ikke i tabellen, så de sorteres her.
  if (sortering.kolonne === "tilbud" || sortering.kolonne === "ordrer") {
    const antall = sortering.kolonne === "tilbud" ? antallTilbud : antallOrdrer;
    const retning = sortering.stigende ? 1 : -1;
    kontakter.sort((a, b) => ((antall.get(a.id) ?? 0) - (antall.get(b.id) ?? 0)) * retning);
  }
  const sortParams = { q: q || undefined, type: filter !== "alle" ? filter : undefined };

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
      </div>

      <nav className="type-switch kompakt" aria-label="Vis">
        {FILTER.map((f) => (
          <Link
            key={f.verdi}
            href={lenke(f.verdi)}
            className={`type-option${f.verdi === filter ? " active" : ""}`}
            aria-current={f.verdi === filter ? "page" : undefined}
          >
            {f.etikett}
          </Link>
        ))}
      </nav>

      <div className="verktoylinje">
        <NyKontakt />
        <form method="get" className="verktoylinje-hoyre">
          {filter !== "alle" && <input type="hidden" name="type" value={filter} />}
          {sp.sort && <input type="hidden" name="sort" value={sortering.kolonne} />}
          {sp.sort && !sortering.stigende && <input type="hidden" name="retning" value="synkende" />}
          <span className="muted tiny">{kontakter.length} kontakter</span>
          {q && (
            <Link className="button ghost" href={lenke(filter, false)}>
              Nullstill
            </Link>
          )}
          <input
            className="input"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Søk"
            title="Søk på navn, e-post eller kontaktperson"
            aria-label="Søk i kontakter"
          />
        </form>
      </div>

      <div className="card">
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
          <div className="tabell-rull">
            <table className="table klikkbar">
              <thead>
                <tr>
                  <SortKolonne kolonne="navn" sortering={sortering} sti="/kontakter" params={sortParams}>
                    Navn
                  </SortKolonne>
                  <th>Type</th>
                  <SortKolonne kolonne="kontaktperson" sortering={sortering} sti="/kontakter" params={sortParams}>
                    Kontaktperson
                  </SortKolonne>
                  <SortKolonne kolonne="telefon" sortering={sortering} sti="/kontakter" params={sortParams}>
                    Telefon
                  </SortKolonne>
                  <SortKolonne kolonne="epost" sortering={sortering} sti="/kontakter" params={sortParams}>
                    E-post
                  </SortKolonne>
                  <SortKolonne kolonne="tilbud" sortering={sortering} sti="/kontakter" params={sortParams} className="num">
                    Tilbud
                  </SortKolonne>
                  <SortKolonne kolonne="ordrer" sortering={sortering} sti="/kontakter" params={sortParams} className="num">
                    Ordrer
                  </SortKolonne>
                  <SortKolonne kolonne="opprettet" sortering={sortering} sti="/kontakter" params={sortParams} className="num">
                    Opprettet
                  </SortKolonne>
                </tr>
              </thead>
              <tbody>
                {kontakter.map((kontakt) => {
                  const harJobber =
                    kontakt.is_customer || antallTilbud.has(kontakt.id) || antallOrdrer.has(kontakt.id);
                  return (
                    <KlikkbarRad key={kontakt.id} href={`/kontakter/${kontakt.id}`}>
                      <td>
                        <Link className="lenke" href={`/kontakter/${kontakt.id}`}>
                          {kontakt.name}
                        </Link>
                      </td>
                      <td>
                        <span className={`kontakt-merke${kontakt.is_supplier ? " leverandor" : ""}`}>
                          {kontakttypeTekst(kontakt)}
                        </span>
                      </td>
                      <td>{kontakt.contact}</td>
                      <td className="nowrap">{kontakt.phone}</td>
                      <td>{kontakt.email}</td>
                      <td className="num">{harJobber ? antallTilbud.get(kontakt.id) ?? 0 : ""}</td>
                      <td className="num">{harJobber ? antallOrdrer.get(kontakt.id) ?? 0 : ""}</td>
                      <td className="num muted nowrap">{formatDate(kontakt.created_at)}</td>
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

function tell(rader: { customer_id: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rader) {
    if (r.customer_id) m.set(r.customer_id, (m.get(r.customer_id) ?? 0) + 1);
  }
  return m;
}
