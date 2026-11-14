import { DashboardVisning, type DashLead, type DashOrdre, type DashStatus } from "./DashboardVisning";
import { aktivitet, kalenderDagar, periodeframdrift } from "./data";
import { formatPrice } from "@/lib/billing/katalog";
import { abonnementsoversikt } from "@/lib/billing/subscription";
import { hentHendingar } from "@/lib/kalender/hent";
import { osloDato, osloMidnatt, pluss } from "@/lib/kalender/oslo";
import { harModul } from "@/lib/moduler";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { ORDER_ACTIVE_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Startsiden: det som ligger og venter (tilbud, ordrer, fakturautkast) som
 * statuskort, uka som kommer i kalenderen, forbruket denne perioden, og de
 * siste henvendelsene og ordrene. Hvert kort lenker til lista det kommer fra.
 */
export default async function DashboardPage() {
  const session = await currentSession();
  const supabase = await supabaseServer();

  const { data: company } = await supabase
    .from("companies")
    .select("name, moduler, created_at")
    .eq("id", session!.companyId)
    .single();
  const ordre = harModul(company?.moduler, "ordre");
  const tom = Promise.resolve({ data: null, count: 0 });

  const admin = supabaseAdmin();
  const idag = osloDato(new Date());
  const tel = (tabell: "leads" | "orders", status: string) =>
    supabase.from(tabell).select("id", { count: "exact", head: true }).eq("status", status);
  const telOrdre = (status: string) => (ordre ? tel("orders", status) : tom);

  const [
    { count: nye },
    { count: genererer },
    { count: utkastKlare },
    { count: bekrefta },
    { data: sisteLeads },
    { count: opne },
    { count: paagaar },
    { count: ferdige },
    { data: fakturautkast },
    { data: sisteOrdrer },
    avtalar,
    oversikt,
  ] = await Promise.all([
    tel("leads", "ny"),
    tel("leads", "genererer"),
    tel("leads", "utkast_klar"),
    tel("leads", "bekrefta"),
    supabase
      .from("leads")
      .select("id, from_name, from_email, subject, status, received_at, created_at")
      .neq("status", "sendt")
      .order("created_at", { ascending: false })
      .limit(6),
    telOrdre("opna"),
    telOrdre("paagaar"),
    telOrdre("ferdig"),
    ordre
      ? supabase.from("invoice_drafts").select("status, totals").in("status", ["utkast", "godkjent", "feil"]).limit(1000)
      : tom,
    ordre
      ? supabase
          .from("orders")
          .select("id, order_no, title, customer_name, status, created_at")
          .in("status", ORDER_ACTIVE_STATUSES)
          .order("created_at", { ascending: false })
          .limit(6)
      : tom,
    // Kalenderen er pynt her: feilar han, skal resten av dashboardet stå.
    ordre
      ? hentHendingar(admin, session!.companyId, { fra: osloMidnatt(idag), til: osloMidnatt(pluss(idag, 7)) }).catch(() => null)
      : null,
    abonnementsoversikt(admin, session!.companyId, company?.created_at ?? new Date().toISOString()),
  ]);

  const { forbruk, abonnement, pakke, kostnad, periode, bedrePakke } = oversikt;
  const { data: bruk } = await admin
    .from("usage_events")
    .select("kind, quantity, created_at")
    .eq("company_id", session!.companyId)
    .in("kind", ["tilbud", "faktura"])
    .gte("created_at", periode.start.toISOString())
    .lt("created_at", periode.slutt.toISOString());

  const leads = (sisteLeads ?? []) as DashLead[];
  const ordrer = (sisteOrdrer ?? []) as DashOrdre[];
  const utkast = (fakturautkast ?? []) as { status: string; totals: { subtotal?: number } | null }[];
  const antal = (status: string) => utkast.filter((u) => u.status === status).length;
  const utkastSum = utkast.reduce((sum, u) => sum + Number(u.totals?.subtotal ?? 0), 0);

  const status: DashStatus[] = [
    {
      tittel: "Tilbud",
      href: "/tilbud/leads",
      verdi: utkastKlare ?? 0,
      tekst: "utkast venter på gjennomsyn",
      tom: "Ingen henvendelser i arbeid",
      segment: [
        { etikett: "Nye", verdi: nye ?? 0, tone: "bla" },
        { etikett: "Genererer", verdi: genererer ?? 0, tone: "gra" },
        { etikett: "Utkast klare", verdi: utkastKlare ?? 0, tone: "gul" },
        { etikett: "Bekreftet", verdi: bekrefta ?? 0, tone: "gronn" },
      ],
    },
  ];
  if (ordre) {
    const aktive = (opne ?? 0) + (paagaar ?? 0);
    status.push(
      {
        tittel: "Ordrer",
        href: "/ordre",
        verdi: aktive,
        tekst: aktive === 1 ? "aktiv ordre" : "aktive ordrer",
        tom: "Ingen ordrer i arbeid",
        segment: [
          { etikett: "Åpne", verdi: opne ?? 0, tone: "bla" },
          { etikett: "Pågår", verdi: paagaar ?? 0, tone: "gul" },
          { etikett: "Klare til fakturering", verdi: ferdige ?? 0, tone: "gronn" },
        ],
      },
      {
        tittel: "Faktura",
        href: "/fakturaer",
        verdi: utkast.length,
        tekst: "fakturautkast ikke overført",
        detalj: utkast.length > 0 ? `${formatPrice(utkastSum)} eks. mva` : undefined,
        tom: "Ingen fakturautkast",
        segment: [
          { etikett: "Utkast", verdi: antal("utkast"), tone: "bla" },
          { etikett: "Godkjent", verdi: antal("godkjent"), tone: "gronn" },
          { etikett: "Feil ved overføring", verdi: antal("feil"), tone: "rod" },
        ],
      },
    );
  }

  return (
    <DashboardVisning
      selskap={company?.name ?? ""}
      ordre={ordre}
      status={status}
      kalender={avtalar ? kalenderDagar(avtalar, idag) : null}
      aktivitet={aktivitet(bruk ?? [], periode, abonnement?.interval ?? "maanad")}
      framdrift={periodeframdrift(periode)}
      leads={leads}
      ordrer={ordrer}
      oversikt={{ forbruk, abonnement, pakke, kostnad, bedrePakke, periode }}
    />
  );
}
