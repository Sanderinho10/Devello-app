import { notFound } from "next/navigation";
import { SkjemaSide } from "./SkjemaSide";
import { finnMal } from "@/lib/dokumentasjon/malar";
import { hentSignaturer } from "@/lib/dokumentasjon/signatur";
import { hentOrdre } from "@/lib/ordre/hent";
import { currentSession, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
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

  const erAdmin = meg?.role === "admin";

  // Signaturene trengs bare for skjema som signeres. Ordren over er hentet
  // med brukerens tilgang, så selskapet er sjekket.
  const admin = supabaseAdmin();
  const [signaturer, { data: bedtAv }] = await Promise.all([
    mal.signature.required ? hentSignaturer(admin, ordre.company_id, session!.userId, erAdmin) : Promise.resolve([]),
    dokument.approval_requested_by
      ? admin.from("users").select("full_name, email").eq("id", dokument.approval_requested_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SkjemaSide
      // Ny nøkkel når dokumentet låses eller åpnes: skjemaet starter på nytt fra det som er lagret.
      key={`${dokument.id}:${dokument.status}`}
      orderId={ordre.id}
      dok={dokument}
      mal={mal}
      erAdmin={erAdmin}
      signaturer={signaturer}
      bedtAv={bedtAv?.full_name || bedtAv?.email || null}
    />
  );
}
