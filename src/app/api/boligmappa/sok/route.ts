import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BoligmappaFeil, boligmappaClient } from "@/lib/boligmappa/client";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Adressesøk i Boligmappa: ?q=Bjørkevegen 22 Bergen → maks 10 treff. */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 3) return NextResponse.json({ adresser: [] });
    const bm = await boligmappaClient(admin, session.companyId);
    const adresser = await bm.sokAdresser(q);
    return NextResponse.json({
      adresser: adresser.map((a) => ({
        id: a.id,
        tekst: a.detailedAddress ?? [[a.street, a.houseNumber, a.houseSubNumber].filter(Boolean).join(" "), [a.postCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      })),
    });
  } catch (err) {
    return errorResponse(err, err instanceof BoligmappaFeil ? (err.status === 401 || err.status === 400 ? 400 : 502) : 500);
  }
}
