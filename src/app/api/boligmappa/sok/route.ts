import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BoligmappaFeil, boligmappaClient, type BmAdresse } from "@/lib/boligmappa/client";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Adressesøk i Boligmappa: ?q=Solheimslien 26 Bergen → adresser med id-en
 * /addresses/{id}/properties tar.
 *
 * To steg, som i Boligmappa sin egen søkekomponent: gatene som matcher
 * gatenavnet, så adressene på hver gate, filtrert på husnummeret hvis
 * det sto i søket. Uten husnummer vises de første adressene på gaten.
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

    const { gate, husnummer, bokstav, sted } = tolkSok(q);
    const bm = await boligmappaClient(admin, session.companyId);

    // Gatenavnet først; treffer det ikke, prøv det første ordet alene —
    // folk skriver «Solheimslien 26 Bergen», og stedsnavnet er ikke en gate.
    let gater = gate ? await bm.sokGater(gate) : [];
    if (gater.length === 0 && gate.includes(" ")) gater = await bm.sokGater(gate.split(" ")[0]);
    if (sted) {
      const s = sted.toLowerCase();
      const iSted = gater.filter((g) => (g.postalPlace ?? "").toLowerCase() === s || (g.municipalityName ?? "").toLowerCase() === s);
      if (iSted.length) gater = iSted;
    }

    const adresser: BmAdresse[] = [];
    for (const g of gater.slice(0, 5)) {
      const paaGaten = await bm.adresserPaaGate(g.id);
      const passar = husnummer
        ? paaGaten.filter(
            (a) =>
              a.houseNumber === husnummer &&
              (!bokstav || (a.houseSubNumber ?? "").toUpperCase() === bokstav),
          )
        : paaGaten;
      adresser.push(...passar);
      if (adresser.length >= 20) break;
    }

    return NextResponse.json({
      adresser: adresser.slice(0, 20).map((a) => ({
        id: a.id,
        tekst: `${[a.streetName, `${a.houseNumber ?? ""}${a.houseSubNumber ?? ""}`].filter(Boolean).join(" ")}, ${[a.postalCode, a.postalPlace].filter(Boolean).join(" ")}`,
      })),
      // Hint til lista når søket mangler husnummer og gaten er lang.
      utenHusnummer: !husnummer && adresser.length >= 20,
    });
  } catch (err) {
    return errorResponse(err, err instanceof BoligmappaFeil ? (err.status === 401 || err.status === 400 ? 400 : 502) : 500);
  }
}

/**
 * «Solheimslien 26B Bergen» → gate «Solheimslien», husnummer «26», bokstav
 * «B», sted «Bergen». Ord etter husnummeret regnes som sted; et postnummer
 * hoppes over.
 */
function tolkSok(q: string): { gate: string; husnummer: string | null; bokstav: string | null; sted: string | null } {
  const ord = q.split(/\s+/).filter(Boolean);
  const gateOrd: string[] = [];
  const stedOrd: string[] = [];
  let husnummer: string | null = null;
  let bokstav: string | null = null;
  for (const o of ord) {
    const m = /^(\d{1,4})([A-Za-zÆØÅæøå]?)$/.exec(o);
    if (m && husnummer === null) {
      husnummer = m[1];
      bokstav = m[2] ? m[2].toUpperCase() : null;
      continue;
    }
    if (/^\d{4}$/.test(o)) continue;
    (husnummer === null ? gateOrd : stedOrd).push(o);
  }
  return { gate: gateOrd.join(" "), husnummer, bokstav, sted: stedOrd.length ? stedOrd.join(" ") : null };
}
