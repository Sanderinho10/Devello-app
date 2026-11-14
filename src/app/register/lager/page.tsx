import { LagerListe } from "./LagerListe";
import { ModulMangler } from "@/components/ModulMangler";
import { hentRoersler } from "@/lib/lager/api";
import { lagerverdi, reknBehaldning } from "@/lib/lager/behaldning";
import { harModul } from "@/lib/moduler";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { selskapetsModular } from "@/app/selskap/innstillinger/moduler";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { StockLocation, StockMovement } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Bilene og lagerrommene, med hva som ligger i hver.
 *
 * Hver bil har et nummer fra samme serie som ordrene. Det er nummeret
 * montøren skriver på bestillingen når han fyller bilen hos grossisten —
 * da legger fakturaen varene i bilen av seg selv, slik en faktura merket
 * med et ordrenummer legger dem på ordren.
 *
 * Siden ligger under Register, ikke /ordre, så modulsperren i
 * ordre/layout.tsx dekker den ikke. Sjekken står her i stedet.
 */
export default async function LagerSide() {
  if (!harModul(await selskapetsModular(), "ordre")) return <ModulMangler modul="Ordre" />;

  const session = (await currentSession())!;
  const supabase = await supabaseServer();

  const [{ data: lager }, roersler, medlemmer, { data: meg }] = await Promise.all([
    supabase.from("stock_locations").select("*").order("active", { ascending: false }).order("location_no"),
    hentRoersler(supabase, session.companyId),
    brukereISelskap(supabase, session.companyId),
    supabase.from("users").select("role").eq("id", session.userId).maybeSingle(),
  ]);

  const perLager = new Map<string, StockMovement[]>();
  for (const r of roersler) {
    const liste = perLager.get(r.location_id) ?? [];
    liste.push(r);
    perLager.set(r.location_id, liste);
  }

  return (
    <LagerListe
      lager={((lager ?? []) as StockLocation[]).map((l) => {
        const varer = reknBehaldning(perLager.get(l.id) ?? []);
        return {
          ...l,
          varelinjer: varer.length,
          verdi: lagerverdi(varer),
          minus: varer.filter((v) => v.quantity < 0).length,
        };
      })}
      medlemmer={medlemmer
        .map((m) => ({ id: m.id, navn: m.full_name || m.email }))
        .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))}
      meg={{ id: session.userId, erAdmin: meg?.role === "admin" }}
    />
  );
}
