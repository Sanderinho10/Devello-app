import { notFound } from "next/navigation";
import { SkjemaSide } from "./SkjemaSide";
import { finnMal } from "@/lib/dokumentasjon/malar";
import { manglandePaakravde } from "@/lib/dokumentasjon/motor";
import type { DokumentData } from "@/lib/dokumentasjon/malar/typar";
import { hentOrdre } from "@/lib/ordre/hent";
import { currentSession, supabaseServer } from "@/lib/supabase/server";
import type { OrderDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Skjemasida: ett dokument, én kolonne. Malen frosset til den versjonen
 * dokumentet ble laget med — finnes ikke nøkkelen lenger, vises dataene
 * uansett, låst.
 */
export default async function DokumentSide({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const ordre = await hentOrdre(id);
  if (!ordre) notFound();

  const session = await currentSession();
  const supabase = await supabaseServer();
  const [{ data: dok }, { data: meg }] = await Promise.all([
    supabase.from("order_documents").select("*").eq("id", docId).eq("order_id", ordre.id).maybeSingle(),
    supabase.from("users").select("role").eq("id", session!.userId).maybeSingle(),
  ]);
  if (!dok) notFound();
  const dokument = dok as OrderDocument;
  const mal = dokument.template_key ? finnMal(dokument.template_key) : null;
  if (!mal) notFound();

  return (
    <SkjemaSide
      orderId={ordre.id}
      dok={dokument}
      mal={mal}
      manglar={manglandePaakravde(mal, dokument.data as DokumentData)}
      erAdmin={meg?.role === "admin"}
    />
  );
}
