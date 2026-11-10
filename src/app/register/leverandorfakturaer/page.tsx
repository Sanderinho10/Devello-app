import Link from "next/link";
import { FakturaListe } from "./FakturaListe";
import { HentFakturaer } from "@/components/HentFakturaer";
import { ModulMangler } from "@/components/ModulMangler";
import { harModul } from "@/lib/moduler";
import { selskapetsModular } from "@/app/selskap/innstillinger/moduler";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { formatDate, type SupplierInvoice, type SupplierInvoiceLine } from "@/lib/types";

export const dynamic = "force-dynamic";

type Visning = "ukopla" | "kopla" | "alle";

/**
 * Leverandørfakturaene, fra begge kildene i samme liste: PowerOffice Go og
 * grossistenes fakturafiler på FTP. «Hent fakturaer nå» henter fra begge.
 *
 * «Ukoblet» er arbeidslista: fakturaer der ordrenummeret ikke ble funnet,
 * eller var tvetydig. Alt annet gikk av seg selv. Kreditnotaer står her
 * også — de kobles aldri automatisk.
 *
 * Siden ligger under Register, ikke /ordre, så modulsperren i
 * ordre/layout.tsx dekker den ikke. Sjekken står her i stedet.
 */
export default async function LeverandorfakturaerPage({
  searchParams,
}: {
  searchParams: Promise<{ vis?: string }>;
}) {
  if (!harModul(await selskapetsModular(), "ordre")) return <ModulMangler modul="Ordre" />;

  const session = await currentSession();
  const supabase = await supabaseServer();
  const visRaa = (await searchParams).vis;
  const vis: Visning = visRaa === "kopla" || visRaa === "alle" ? visRaa : "ukopla";

  const [{ data: kopling }, { count: ukopla }, { count: kopla }, { count: alle }, { data: ftpKilder }] =
    await Promise.all([
      supabase
        .from("accounting_connections")
        .select("id, status, last_sync_at, last_sync_note")
        .eq("company_id", session!.companyId)
        .maybeSingle(),
      supabase
        .from("supplier_invoices")
        .select("id", { count: "exact", head: true })
        .in("match_status", ["ukopla", "delvis"]),
      supabase
        .from("supplier_invoices")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "kopla"),
      supabase.from("supplier_invoices").select("id", { count: "exact", head: true }),
      // Grossister med fakturafiler satt opp — den andre kilden. Tabellen har
      // passordet og er bare for service role, så bare statusfeltene hentes.
      supabaseAdmin()
        .from("supplier_ftp")
        .select("last_invoice_fetch_at, last_invoice_fetch_status, last_invoice_fetch_note, suppliers!inner(name)")
        .eq("company_id", session!.companyId)
        .not("fakturafil_pattern", "is", null)
        .neq("fakturafil_pattern", ""),
    ]);

  let sporring = supabase
    .from("supplier_invoices")
    .select("*")
    .order("voucher_date", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .limit(200);
  if (vis === "ukopla") sporring = sporring.in("match_status", ["ukopla", "delvis"]);
  if (vis === "kopla") sporring = sporring.eq("match_status", "kopla");
  const { data: fakturaer } = await sporring;
  const liste = (fakturaer ?? []) as SupplierInvoice[];

  const [{ data: linjer }, { data: ordrar }] = await Promise.all([
    liste.length
      ? supabase
          .from("supplier_invoice_lines")
          .select("*")
          .in(
            "invoice_id",
            liste.map((f) => f.id),
          )
          .order("line_no")
      : Promise.resolve({ data: [] as SupplierInvoiceLine[] }),
    supabase
      .from("orders")
      .select("id, order_no, title, status, customer_name")
      .neq("status", "avbrutt")
      .order("order_no", { ascending: false })
      .limit(500),
  ]);

  const harKopling = Boolean(kopling && kopling.status !== "kopla_fra");
  const ftp = ftpKilder ?? [];
  const harKilde = harKopling || ftp.length > 0;
  // Feil fra siste henting, fra hver kilde for seg.
  const feilmeldinger = [
    ...(harKopling && kopling?.last_sync_note?.startsWith("Feilet") ? [`PowerOffice Go: ${kopling.last_sync_note}`] : []),
    ...ftp
      .filter((f) => f.last_invoice_fetch_status === "feil")
      .map((f) => {
        const s = f.suppliers as unknown as { name: string } | { name: string }[];
        const navn = (Array.isArray(s) ? s[0]?.name : s?.name) ?? "Grossist";
        return `${navn} (FTP): ${f.last_invoice_fetch_note ?? "henting feilet"}`;
      }),
  ];
  const sistHentet = [harKopling ? kopling?.last_sync_at : null, ...ftp.map((f) => f.last_invoice_fetch_at)]
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const harFakturaer = (alle ?? 0) > 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Leverandørfakturaer</h1>
          <p className="page-subtitle">
            Fra regnskapssystemet eller grossistens fakturafiler, koblet til ordren grossisten skrev på fakturaen.
          </p>
        </div>
      </div>

      {!harKilde && !harFakturaer ? (
        <div className="card empty">
          <div className="empty-title">Ingen fakturakilde ennå</div>
          <div>
            Koble til PowerOffice Go under{" "}
            <Link href="/selskap/innstillinger/regnskap" style={{ textDecoration: "underline" }}>
              Selskap → Innstillinger → Regnskap
            </Link>
            , eller sett opp fakturafiler fra grossisten under{" "}
            <Link href="/register/grossister" style={{ textDecoration: "underline" }}>
              Register → Grossister
            </Link>
            , så hentes fakturaene hit.
          </div>
        </div>
      ) : (
        <>
        <nav className="type-switch kompakt" aria-label="Vis">
          {(
            [
              ["ukopla", "Ukoblet", ukopla],
              ["kopla", "Koblet", kopla],
              ["alle", "Alle", alle],
            ] as [Visning, string, number | null][]
          ).map(([verdi, etikett, antall]) => (
            <Link
              key={verdi}
              href={verdi === "ukopla" ? "/register/leverandorfakturaer" : `/register/leverandorfakturaer?vis=${verdi}`}
              className={`type-option${vis === verdi ? " active" : ""}`}
              aria-current={vis === verdi ? "page" : undefined}
            >
              {etikett}
              <span className="fane-tal">{antall ?? 0}</span>
            </Link>
          ))}
        </nav>

        {/* Verktøylinja som i Go: hentingen til venstre, når det sist ble
            hentet til høyre. En feil fra siste henting får en egen linje. */}
        <div className="verktoylinje">
          {harKilde && <HentFakturaer />}
          {sistHentet && (
            <span className="verktoylinje-hoyre tiny muted">Sist hentet {formatDate(sistHentet)}</span>
          )}
        </div>
        {feilmeldinger.map((m) => (
          <div key={m} className="banner warning">
            {m}
          </div>
        ))}

        <div className="card allow-overflow">
          {liste.length === 0 ? (
            <div className="empty">
              <div className="empty-title">
                {vis === "ukopla" ? "Ingen ukoblede fakturaer" : "Ingen fakturaer ennå"}
              </div>
              <div>
                {vis === "ukopla"
                  ? "Alt som er hentet har funnet ordren sin."
                  : harKilde
                    ? "Fakturaene hentes hver natt, eller trykk «Hent fakturaer nå»."
                    : "Koble til PowerOffice Go eller sett opp fakturafiler på en grossist."}
              </div>
            </div>
          ) : (
            <FakturaListe
              fakturaer={liste}
              linjer={(linjer ?? []) as SupplierInvoiceLine[]}
              ordrar={(ordrar ?? []).map((o) => ({
                id: o.id,
                order_no: o.order_no,
                title: o.title,
                status: o.status,
                customer_name: o.customer_name,
              }))}
            />
          )}
        </div>
        </>
      )}
    </>
  );
}
