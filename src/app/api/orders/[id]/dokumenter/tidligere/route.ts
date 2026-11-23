import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgDokument, tittelMedVersjon } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { OrderDocument } from "@/lib/types";

/**
 * Dokumentasjonen fra kundens tidligere ordrer.
 *
 * Når firmaet er tilbake hos en kunde, ligger kursfortegnelsen og
 * samsvarserklæringen fra forrige jobb på en annen ordre. Her kommer de:
 * ferdige skjema og opplastede filer fra de andre ordrene til samme kunde
 * — og fra ordrer på samme adresse, om kunden er registrert på nytt.
 * Nyeste ordre først. Selve fila hentes fra den ordren den hører til.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id);
    if (r instanceof NextResponse) return r;
    const ordre = r.ordre;

    const felt = "id, order_no, title, site_address, status, created_at";
    const basis = () => admin.from("orders").select(felt).eq("company_id", session.companyId).neq("id", ordre.id);
    const adresse = ordre.site_address?.trim();
    const [paaKunde, paaAdresse] = await Promise.all([
      ordre.customer_id ? basis().eq("customer_id", ordre.customer_id).limit(200) : Promise.resolve({ data: [] }),
      adresse ? basis().ilike("site_address", adresse.replace(/[%_\\]/g, "\\$&")).limit(200) : Promise.resolve({ data: [] }),
    ]);

    type Rad = { id: string; order_no: number; title: string; site_address: string | null; status: string; created_at: string };
    const ordrer = new Map<string, Rad>();
    for (const o of [...((paaKunde.data ?? []) as Rad[]), ...((paaAdresse.data ?? []) as Rad[])]) ordrer.set(o.id, o);
    if (ordrer.size === 0) return NextResponse.json({ ordrer: [] });

    const { data: dokument, error } = await admin
      .from("order_documents")
      .select("id, order_id, kind, title, revision, status, mime_type, file_name, signed_name, signed_at, created_at, note_id")
      .eq("company_id", session.companyId)
      .in("order_id", [...ordrer.keys()])
      .eq("status", "ferdig")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    type Dok = Pick<OrderDocument, "id" | "order_id" | "kind" | "title" | "revision" | "status" | "mime_type" | "file_name" | "signed_name" | "signed_at" | "created_at" | "note_id">;
    const perOrdre = new Map<string, Dok[]>();
    for (const d of (dokument ?? []) as Dok[]) {
      // Bilder montøren tok til et notat er jobbdagbok, ikke dokumentasjon.
      if (d.kind === "fil" && d.note_id) continue;
      perOrdre.set(d.order_id, [...(perOrdre.get(d.order_id) ?? []), d]);
    }

    const ut = [...ordrer.values()]
      .filter((o) => perOrdre.has(o.id))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((o) => ({
        id: o.id,
        order_no: o.order_no,
        title: o.title,
        site_address: o.site_address,
        created_at: o.created_at,
        dokument: (perOrdre.get(o.id) ?? []).map((d) => ({
          id: d.id,
          kind: d.kind,
          title: tittelMedVersjon(d),
          type: d.kind === "skjema" ? "Skjema" : d.mime_type?.startsWith("image/") ? "Bilde" : "Fil",
          dato: d.signed_at ?? d.created_at,
          url: `/api/orders/${o.id}/dokumenter/${d.id}/${d.kind === "skjema" ? "pdf" : "fil"}`,
        })),
      }));
    return NextResponse.json({ ordrer: ut });
  } catch (err) {
    return errorResponse(err);
  }
}
