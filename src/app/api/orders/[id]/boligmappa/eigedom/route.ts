import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgDokument } from "@/lib/dokumentasjon/dokument";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BoligmappaEigedom } from "@/lib/types";

/** Eiendommen brukeren bekreftet, lagret på ordren. Tom body = fjern. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgDokument(admin, session, id);
    if (r instanceof NextResponse) return r;

    const body = (await request.json().catch(() => ({}))) as { boligmappa_number?: unknown; property?: unknown };
    let endringer: Record<string, unknown>;
    if (!body.boligmappa_number) {
      endringer = { boligmappa_number: null, boligmappa_property: null };
    } else {
      const nr = String(body.boligmappa_number).trim().slice(0, 40);
      const p = (body.property && typeof body.property === "object" ? body.property : {}) as Record<string, unknown>;
      const property: BoligmappaEigedom = {
        boligmappaNumber: nr,
        address: typeof p.address === "string" ? p.address.slice(0, 200) : null,
        unitNumber: typeof p.unitNumber === "string" ? p.unitNumber.slice(0, 20) : null,
        propertyType: typeof p.propertyType === "string" ? p.propertyType.slice(0, 40) : null,
        cadastre: p.cadastre && typeof p.cadastre === "object" ? (p.cadastre as BoligmappaEigedom["cadastre"]) : null,
      };
      endringer = { boligmappa_number: nr, boligmappa_property: property };
    }
    const { data, error } = await admin
      .from("orders")
      .update(endringer)
      .eq("id", r.ordre.id)
      .eq("company_id", session.companyId)
      .select("id, boligmappa_number, boligmappa_property")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
