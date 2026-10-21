import { DashboardVisning, type DashLead, type DashOrdre, type DashTal } from "./DashboardVisning";
import { abonnementsoversikt } from "@/lib/billing/subscription";
import { harModul } from "@/lib/moduler";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { ORDER_ACTIVE_STATUSES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Startsiden, som i Go: det som venter, de siste henvendelsene og ordrene,
 * og forbruket denne perioden. Hvert tall lenker til lista det kommer fra.
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

  const [
    { count: nyeLeads },
    { count: utkastKlare },
    { data: sisteLeads },
    { count: aktiveOrdrer },
    { count: klareTilFaktura },
    { count: fakturaforslag },
    { data: sisteOrdrer },
    oversikt,
  ] = await Promise.all([
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "ny"),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "utkast_klar"),
    supabase
      .from("leads")
      .select("id, from_name, from_email, subject, status, received_at, created_at")
      .neq("status", "sendt")
      .order("created_at", { ascending: false })
      .limit(6),
    ordre
      ? supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ORDER_ACTIVE_STATUSES)
      : tom,
    ordre ? supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "ferdig") : tom,
    ordre
      ? supabase.from("invoice_drafts").select("id", { count: "exact", head: true }).in("status", ["utkast", "godkjent", "feil"])
      : tom,
    ordre
      ? supabase
          .from("orders")
          .select("id, order_no, title, customer_name, status, created_at")
          .in("status", ORDER_ACTIVE_STATUSES)
          .order("created_at", { ascending: false })
          .limit(6)
      : tom,
    abonnementsoversikt(supabaseAdmin(), session!.companyId, company?.created_at ?? new Date().toISOString()),
  ]);

  const { forbruk, abonnement, pakke, kostnad, periode, bedrePakke } = oversikt;
  const leads = (sisteLeads ?? []) as DashLead[];
  const ordrer = (sisteOrdrer ?? []) as DashOrdre[];

  const tal: DashTal[] = [
    { etikett: "Nye henvendelser", verdi: nyeLeads ?? 0, href: "/tilbud/leads", hint: "Ikke behandlet ennå", varsle: (nyeLeads ?? 0) > 0 },
    { etikett: "Utkast klare", verdi: utkastKlare ?? 0, href: "/tilbud/leads", hint: "Tilbud som venter på gjennomsyn" },
  ];
  if (ordre) {
    tal.push(
      { etikett: "Aktive ordrer", verdi: aktiveOrdrer ?? 0, href: "/ordre", hint: "Åpne og pågående" },
      { etikett: "Klare til fakturering", verdi: klareTilFaktura ?? 0, href: "/ordre", hint: "Ferdige ordrer", varsle: (klareTilFaktura ?? 0) > 0 },
      { etikett: "Fakturaforslag", verdi: fakturaforslag ?? 0, href: "/ordre", hint: "Ikke overført til regnskap" },
    );
  }

  return (
    <DashboardVisning
      selskap={company?.name ?? ""}
      ordre={ordre}
      tal={tal}
      leads={leads}
      ordrer={ordrer}
      oversikt={{ forbruk, abonnement, pakke, kostnad, bedrePakke, periode }}
    />
  );
}
