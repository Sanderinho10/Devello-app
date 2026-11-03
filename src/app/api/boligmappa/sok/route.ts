import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BoligmappaFeil, boligmappaClient } from "@/lib/boligmappa/client";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Adressesøk i Boligmappa: ?q=Bjørkevegen 22 Bergen.
 *
 * Treffene er av to slag: adresser (id på formen «301-15999-1-A», som
 * /addresses/{id}/properties tar) og bruksenheter («unit», egen id).
 * Adressene først; enhetene vises merket, så brukeren ser forskjellen.
 */
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
    const alle = await bm.sokAdresser(q);
    const erEnhet = (t: string | null) => (t ?? "").toLowerCase() === "unit";
    const adresser = [...alle.filter((a) => !erEnhet(a.type)), ...alle.filter((a) => erEnhet(a.type))].slice(0, 20);
    // Ett råtreff per type, til formen på adressetreffene er bekreftet.
    const typar = new Map<string, string>();
    for (const a of alle) {
      const t = a.type ?? "?";
      if (!typar.has(t)) typar.set(t, JSON.stringify(a.raw).slice(0, 400));
    }
    return NextResponse.json({
      adresser: adresser.map((a) => ({
        id: a.id,
        type: a.type,
        tekst: a.detailedAddress ?? [[a.street, a.houseNumber, a.houseSubNumber].filter(Boolean).join(" "), [a.postCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      })),
      eksempel: alle.length ? [...typar].map(([t, r]) => `${t}: ${r}`).join("\n") : null,
    });
  } catch (err) {
    return errorResponse(err, err instanceof BoligmappaFeil ? (err.status === 401 || err.status === 400 ? 400 : 502) : 500);
  }
}
