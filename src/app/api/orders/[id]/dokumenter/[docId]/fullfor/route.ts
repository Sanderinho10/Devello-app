import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { klarTilFullfoering, lagDokumentPdf, malFor, ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { kanBruke } from "@/lib/dokumentasjon/signatur";
import { erAdmin } from "@/lib/ordre/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CompanySignature } from "@/lib/types";

export const maxDuration = 120;

/**
 * Fullfører et skjema: påkrevde felt sjekkes, PDF-en lages, skjemaet låses.
 *
 * De fleste skjema fullføres uten signatur — arket sier hvem som fullførte
 * det og når. Samsvarserklæringen (mal.signature.required) godkjennes med
 * en lagret signatur: body { signature_id }. Montøren har skrevet navnet
 * sitt i skjemaet; den som godkjenner, velger sin signatur, og bildet
 * bygges inn i PDF-en. Bare signaturens egen bruker eller en administrator
 * kan signere med den.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, docId } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id, docId);
    if (r instanceof NextResponse) return r;
    const dok = r.dok!;
    const mal = malFor(dok);
    if (dok.kind !== "skjema" || !mal) return NextResponse.json({ error: "Bare skjema kan fullføres." }, { status: 400 });
    if (dok.status === "ferdig") return NextResponse.json(dok);

    const manglar = klarTilFullfoering(dok);
    if (manglar.length) {
      return NextResponse.json({ error: "Skjemaet mangler påkrevde felt.", manglar }, { status: 400 });
    }

    const naa = new Date().toISOString();
    let navn: string;
    let signatur: CompanySignature | null = null;

    if (mal.signature.required) {
      const body = (await request.json().catch(() => ({}))) as { signature_id?: unknown };
      if (typeof body.signature_id !== "string" || !body.signature_id) {
        return NextResponse.json({ error: "Velg signaturen skjemaet skal godkjennes med." }, { status: 400 });
      }
      const { data } = await admin
        .from("company_signatures")
        .select("*")
        .eq("id", body.signature_id)
        .eq("company_id", session.companyId)
        .maybeSingle();
      signatur = (data as CompanySignature | null) ?? null;
      if (!signatur) return NextResponse.json({ error: "Fant ikke signaturen." }, { status: 400 });
      if (!kanBruke(signatur, session.userId, await erAdmin(admin, session))) {
        return NextResponse.json({ error: "Du kan bare signere med din egen signatur." }, { status: 403 });
      }
      navn = signatur.name;
    } else {
      const { data: user } = await admin.from("users").select("full_name, email").eq("id", session.userId).maybeSingle();
      navn = user?.full_name || user?.email || "ukjent bruker";
    }

    const { path } = await lagDokumentPdf(admin, r.ordre, dok, {
      name: navn,
      at: naa,
      tittel: signatur?.title ?? null,
      bildeSti: signatur?.image_path ?? null,
    });

    const { data, error } = await admin
      .from("order_documents")
      .update({
        status: "ferdig",
        pdf_path: path,
        signed_by: session.userId,
        signed_name: navn,
        signed_at: naa,
        signature_id: signatur?.id ?? null,
      })
      .eq("id", dok.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await admin.from("order_events").insert({
      order_id: r.ordre.id,
      kind: "dokumentasjon",
      note: signatur ? `${dok.title} godkjent og signert av ${navn}` : `${dok.title} fullført av ${navn}`,
      created_by: session.userId,
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
