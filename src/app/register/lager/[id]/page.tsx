import { notFound } from "next/navigation";
import { LagerSide } from "./LagerSide";
import { ModulMangler } from "@/components/ModulMangler";
import { hentRoersler } from "@/lib/lager/api";
import { lagerverdi, reknBehaldning } from "@/lib/lager/behaldning";
import { harModul } from "@/lib/moduler";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { selskapetsModular } from "@/app/selskap/innstillinger/moduler";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { StockLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Hvor mange bevegelser historikken viser. Beholdningen regnes alltid av alle. */
const HISTORIKK = 150;

/** Én bil: hva som ligger i den, og alt som har gått inn og ut. */
export default async function LagerDetalj({ params }: { params: Promise<{ id: string }> }) {
  if (!harModul(await selskapetsModular(), "ordre")) return <ModulMangler modul="Ordre" />;

  const { id } = await params;
  const session = (await currentSession())!;
  const supabase = await supabaseServer();

  const { data: lager } = await supabase.from("stock_locations").select("*").eq("id", id).maybeSingle();
  if (!lager) notFound();

  const [roersler, medlemmer, { data: meg }, { count: grossistar }] = await Promise.all([
    hentRoersler(supabase, session.companyId, id),
    brukereISelskap(supabase, session.companyId),
    supabase.from("users").select("role").eq("id", session.userId).maybeSingle(),
    supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("company_id", session.companyId).eq("active", true),
  ]);
  const varer = reknBehaldning(roersler);

  return (
    <LagerSide
      lager={lager as StockLocation}
      varer={varer}
      verdi={lagerverdi(varer)}
      historikk={roersler.slice(-HISTORIKK).reverse()}
      fleireRoersler={roersler.length > HISTORIKK}
      medlemmer={medlemmer
        .map((m) => ({ id: m.id, navn: m.full_name || m.email }))
        .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))}
      harKatalog={(grossistar ?? 0) > 0}
      meg={{ id: session.userId, erAdmin: meg?.role === "admin" }}
    />
  );
}
