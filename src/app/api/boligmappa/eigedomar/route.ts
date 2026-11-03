import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BoligmappaFeil, boligmappaClient } from "@/lib/boligmappa/client";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Eiendommene på en adresse: ?addressId= → boligmappanummer per enhet. */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const addressId = (request.nextUrl.searchParams.get("addressId") ?? "").trim();
    if (!addressId) return NextResponse.json({ error: "addressId mangler." }, { status: 400 });
    const bm = await boligmappaClient(admin, session.companyId);
    const eigedomar = await bm.eigedomar(addressId);
    return NextResponse.json({
      eigedomar: eigedomar.map((e) => ({
        boligmappaNumber: e.boligmappaNumber,
        address: e.address,
        unitNumber: e.unitNumber,
        propertyType: e.propertyType,
        cadastre: e.cadastre,
      })),
    });
  } catch (err) {
    // Id-en inn i meldingen: «ugyldige tegn» fra Boligmappa sier ingenting
    // uten å vise hva vi faktisk sendte.
    const id = (request.nextUrl.searchParams.get("addressId") ?? "").trim();
    const m = `${err instanceof Error ? err.message : String(err)} (adresse-id «${id}»)`;
    return errorResponse(new Error(m), err instanceof BoligmappaFeil ? (err.status === 401 || err.status === 400 ? 400 : 502) : 500);
  }
}
