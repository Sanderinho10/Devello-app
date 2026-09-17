import { GrossistSok } from "@/components/GrossistSok";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type Supplier } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Grossistene selskapet handler hos, og katalogen deres.
 *
 * Ingen opplasting her ennå: varefilene er 50 MB+, og det trenger lagring
 * og en bakgrunnsjobb. Inntil det er på plass importerer Devello med
 * scripts/importer-grossist.ts. Søkefeltet er til for å se at katalogen er
 * riktig — «finner jeg kabelen, og står den per meter?»
 */
export default async function GrossisterPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const { data: rader } = await supabase
    .from("suppliers")
    .select("*")
    .eq("company_id", session!.companyId)
    .order("name");
  const grossistar = (rader ?? []) as Supplier[];

  const antall = await Promise.all(
    grossistar.map(async (g) => {
      const { count } = await supabase
        .from("supplier_items")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", g.id)
        .eq("active", true);
      return count ?? 0;
    }),
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Grossister</h1>
          <p className="page-subtitle">
            Katalogen materiellet velges fra. Prisene står per måleenhet — kabel per meter, ikke per 100.
          </p>
        </div>
      </div>

      {grossistar.length === 0 ? (
        <div className="card empty">
          <div className="empty-title">Ingen grossister ennå</div>
          <div>
            Katalogen importeres av Devello inntil videre — send oss prisfilen fra grossisten.
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="grid-2">
            {grossistar.map((g, i) => (
              <div key={g.id} className="card card-pad">
                <div className="row-between" style={{ marginBottom: 6 }}>
                  <strong>{g.name}</strong>
                  {g.last_import_status && (
                    <span className={`pill ${g.last_import_status === "ok" ? "ferdig" : "avbrutt"}`}>
                      {g.last_import_status === "ok" ? "Importert" : "Import feilet"}
                    </span>
                  )}
                </div>
                <div className="tiny muted">
                  {g.customer_no ? `Kundenr. ${g.customer_no}` : "Kundenummer mangler"}
                  {" · "}
                  {antall[i].toLocaleString("nb-NO")} aktive varer
                </div>
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  {g.last_import_at
                    ? `Siste import ${formatDate(g.last_import_at)}${g.last_import_note ? ` — ${g.last_import_note}` : ""}`
                    : "Ingen import ennå"}
                </div>
              </div>
            ))}
          </div>

          <div className="card card-pad">
            <span className="label">Slå opp i katalogen</span>
            <GrossistSok />
          </div>
        </div>
      )}
    </>
  );
}
