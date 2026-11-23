import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { BoligmappaFeil, boligmappaClient, type BmAdresse } from "@/lib/boligmappa/client";
import { tolkSok } from "@/lib/boligmappa/sok";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Adressesøk i Boligmappa: ?q=Solheimslien 26, 5054 Bergen → adresser med id-en
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

    const { gate, husnummer, bokstav, postnummer, sted } = tolkSok(q);
    const bm = await boligmappaClient(admin, session.companyId);

    // Gatenavnet først; treffer det ikke, prøv det første ordet alene —
    // folk skriver «Solheimslien 26 Bergen», og stedsnavnet er ikke en gate.
    // Uten gatenavn («6963» alene) prøves postnummeret eller stedet som søk.
    const sokeord = gate || postnummer || sted || "";
    let gater = sokeord ? await bm.sokGater(sokeord) : [];
    if (gater.length === 0 && gate.includes(" ")) gater = await bm.sokGater(gate.split(" ")[0]);
    // Postnummeret er det sikreste: samme gatenavn finnes i flere kommuner.
    const paaPostnummer = postnummer ? gater.filter((g) => g.postalCode === postnummer) : [];
    if (paaPostnummer.length) gater = paaPostnummer;
    else if (sted) {
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
