import { GrossistKort } from "./GrossistKort";
import { NyGrossist } from "./NyGrossist";
import { GrossistSok } from "@/components/GrossistSok";
import { utanPassord } from "@/lib/grossist/api";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { ImportJob, Supplier, SupplierFtpPublic } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Grossistene selskapet handler hos, katalogen deres, og hvordan den
 * holdes oppdatert: FTP-henting hver natt, «Hent nå», eller opplasting i
 * nettleseren. FTP-oppsettet leses via service role og strippes for
 * passordet før det går til klienten — tabellen har ingen policy.
 */
export default async function GrossisterPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const [{ data: rader }, { data: meg }, { data: ftpRader }, { data: jobbar }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("company_id", session!.companyId).order("name"),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
    admin.from("supplier_ftp").select("*").eq("company_id", session!.companyId),
    supabase
      .from("import_jobs")
      .select("*")
      .eq("company_id", session!.companyId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const grossistar = (rader ?? []) as Supplier[];
  const erAdmin = meg?.role === "admin";
  const ftpAv = new Map<string, SupplierFtpPublic>();
  for (const r of ftpRader ?? []) {
    const p = utanPassord(r as Record<string, unknown>);
    if (p) ftpAv.set(p.supplier_id, p);
  }
  const jobbarAv = new Map<string, ImportJob[]>();
  for (const j of (jobbar ?? []) as ImportJob[]) {
    const liste = jobbarAv.get(j.supplier_id) ?? [];
    if (liste.length < 5) liste.push(j);
    jobbarAv.set(j.supplier_id, liste);
  }

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
        {erAdmin && <NyGrossist />}
      </div>

      {grossistar.length === 0 ? (
        <div className="card empty">
          <div className="empty-title">Ingen grossister ennå</div>
          <div>
            {erAdmin
              ? "Trykk «Ny grossist», og sett opp FTP-henting eller last opp prisfilen."
              : "En administrator legger til grossisten og prisfilen."}
          </div>
        </div>
      ) : (
        <div className="stack">
          {grossistar.map((g, i) => (
            <GrossistKort
              key={g.id}
              grossist={g}
              aktiveVarer={antall[i]}
              ftp={ftpAv.get(g.id) ?? null}
              jobbar={jobbarAv.get(g.id) ?? []}
              erAdmin={erAdmin}
            />
          ))}

          <div className="card card-pad">
            <span className="label">Slå opp i katalogen</span>
            <GrossistSok />
          </div>
        </div>
      )}
    </>
  );
}
