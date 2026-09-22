import { notFound } from "next/navigation";
import { DokumentasjonFane } from "./DokumentasjonFane";
import { malarForFag } from "@/lib/dokumentasjon/malar";
import { hentOrdre } from "@/lib/ordre/hent";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import type { OrderDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Dokumentasjon-fanen: eiendommen i Boligmappa, dokumentene på ordren,
 * og malene for selskapets fag. Boligmappa-koplinga leses via service
 * role (tokens har ingen policy) — bare status og navn går til klienten.
 */
export default async function DokumentasjonSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();
  const admin = supabaseAdmin();

  const [{ data: dokument }, { data: company }, { data: meg }, { data: kopling }] = await Promise.all([
    supabase.from("order_documents").select("*").eq("order_id", ordre.id).order("created_at", { ascending: true }),
    supabase.from("companies").select("fag").eq("id", session!.companyId).single(),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
    admin
      .from("boligmappa_connections")
      .select("status, status_reason, environment")
      .eq("company_id", session!.companyId)
      .maybeSingle(),
  ]);

  return (
    <DokumentasjonFane
      ordre={{
        id: ordre.id,
        order_no: ordre.order_no,
        status: ordre.status,
        site_address: ordre.site_address,
        boligmappa_number: ordre.boligmappa_number,
        boligmappa_property: ordre.boligmappa_property,
      }}
      dokument={(dokument ?? []) as OrderDocument[]}
      malar={malarForFag(company?.fag).map((m) => ({ key: m.key, title: m.title, lovgrunnlag: m.lovgrunnlag, beskrivelse: m.beskrivelse ?? null }))}
      boligmappa={kopling ? { status: kopling.status as "aktiv" | "feil", status_reason: kopling.status_reason, environment: kopling.environment } : null}
      erAdmin={meg?.role === "admin"}
    />
  );
}
