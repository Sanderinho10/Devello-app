import { Timeregister, type TimeRad } from "./Timeregister";
import { ModulMangler } from "@/components/ModulMangler";
import { harModul } from "@/lib/moduler";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import { selskapetsModular } from "@/app/selskap/innstillinger/moduler";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hentAktivitetar } from "@/lib/timer/api";

export const dynamic = "force-dynamic";

type Vis = "alle" | "ordre" | "intern";

/** Flere enn dette i én periode, og perioden bør snevres inn. */
const MAKS_RADER = 2000;

/**
 * Timeregisteret: alle timene i selskapet på ett sted, på tvers av ordrene
 * — og interntiden, som ikke hører til noen ordre.
 *
 * En administrator ser alle, kan føre for hvem som helst, og kan flytte
 * timer mellom ordrer. En montør ser og fører sine egne. Det er samme
 * regel som API-et håndhever.
 *
 * Siden ligger under Register, ikke /ordre, så modulsperren i
 * ordre/layout.tsx dekker den ikke. Sjekken står her i stedet.
 */
export default async function TimeregisterSide({
  searchParams,
}: {
  searchParams: Promise<{ fra?: string; til?: string; montor?: string; vis?: string }>;
}) {
  if (!harModul(await selskapetsModular(), "ordre")) return <ModulMangler modul="Ordre" />;

  const session = (await currentSession())!;
  const supabase = await supabaseServer();
  const sp = await searchParams;

  const [fraStd, tilStd] = denneMaaneden();
  const fra = erDato(sp.fra) ? sp.fra! : fraStd;
  const til = erDato(sp.til) ? sp.til! : tilStd;
  const vis: Vis = sp.vis === "ordre" || sp.vis === "intern" ? sp.vis : "alle";

  const { data: meg } = await supabase.from("users").select("role").eq("id", session.userId).maybeSingle();
  const erAdmin = meg?.role === "admin";
  const montor = erAdmin ? (sp.montor ?? "") : session.userId;

  let sporring = supabase
    .from("time_entries")
    .select("*, orders(id, order_no, title, status, customer_name)")
    .gte("work_date", fra)
    .lte("work_date", til)
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAKS_RADER);
  if (montor) sporring = sporring.eq("user_id", montor);
  if (vis === "ordre") sporring = sporring.not("order_id", "is", null);
  if (vis === "intern") sporring = sporring.not("internal_activity_id", "is", null);

  const [{ data: rader }, medlemmer, { data: timetypar }, aktivitetar] = await Promise.all([
    sporring,
    brukereISelskap(supabase, session.companyId),
    // Samme regel som API-et: aktive rader av typen «time» i aktive lister.
    supabase
      .from("price_list_items")
      .select("id, name, unit, unit_price, price_lists!inner(active)")
      .eq("company_id", session.companyId)
      .eq("kind", "time")
      .eq("active", true)
      .eq("price_lists.active", true)
      .order("position")
      .order("name"),
    // Med service role: et selskap uten aktiviteter får standardlista her.
    hentAktivitetar(supabaseAdmin(), session.companyId, { ogsaaInaktive: true }),
  ]);

  return (
    <Timeregister
      rader={(rader ?? []) as TimeRad[]}
      avkortet={(rader ?? []).length >= MAKS_RADER}
      filter={{ fra, til, montor: erAdmin ? montor : "", vis }}
      medlemmer={medlemmer
        .map((m) => ({ id: m.id, navn: m.full_name || m.email }))
        .sort((a, b) => a.navn.localeCompare(b.navn, "nb"))}
      timetypar={(timetypar ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        unit: t.unit,
        unit_price: Number(t.unit_price),
      }))}
      aktivitetar={aktivitetar.map((a) => ({ id: a.id, name: a.name, active: a.active }))}
      meg={{ id: session.userId, erAdmin }}
    />
  );
}

function erDato(v: string | undefined): boolean {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime()));
}

/** Første og siste dag i inneværende måned, norsk tid. */
function denneMaaneden(): [string, string] {
  const iDag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
  const [aar, mnd] = iDag.split("-").map(Number);
  const siste = new Date(Date.UTC(aar, mnd, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return [`${aar}-${p(mnd)}-01`, `${aar}-${p(mnd)}-${p(siste)}`];
}
