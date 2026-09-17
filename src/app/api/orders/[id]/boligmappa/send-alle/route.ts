import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgDokument, sendTilBoligmappa } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { OrderDocument } from "@/lib/types";

export const maxDuration = 300;

/** Alle ferdige dokument uten Boligmappa-id, ett etter ett. Feil stopper ikke resten. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.ordre.boligmappa_number) return NextResponse.json({ error: "Finn eiendommen i Boligmappa først." }, { status: 400 });

    const { data: dokument } = await admin
      .from("order_documents")
      .select("*")
      .eq("order_id", r.ordre.id)
      .eq("status", "ferdig")
      .is("boligmappa_file_id", null)
      .order("created_at", { ascending: true });

    let sendt = 0;
    const feil: string[] = [];
    for (const dok of (dokument ?? []) as OrderDocument[]) {
      const res = await sendTilBoligmappa(admin, r.ordre, dok);
      if (res.ok) sendt += 1;
      else feil.push(`${dok.title}: ${res.error}`);
    }
    return NextResponse.json({ sendt, feil });
  } catch (err) {
    return errorResponse(err);
  }
}
