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
 * To steg, som i Boligmappa sin egen søkekomponent, og søket går mens man
 * skriver:
 *
 *   1. Uten husnummer svarer vi med gatene som matcher («Solheimslien,
 *      5054 Bergen»). Ett kall til Boligmappa, så det tåler hvert
 *      tastetrykk — og ingen adresser gjettes før nummeret er skrevet.
 *   2. Med husnummer: adressene med det nummeret, på gatene som matcher.
 *      ?gate=<id> snevrer inn til gaten brukeren valgte i steg 1.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;
  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 3) return NextResponse.json({ gater: [], adresser: [] });
    const valgtGate = (request.nextUrl.searchParams.get("gate") ?? "").trim();

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

    // Steg 1: bare gatenavnet. Gatene er forslagene; adressene venter på nummeret.
    if (!husnummer) {
      return NextResponse.json({
        gater: gater.slice(0, 10).map((g) => ({
          id: g.id,
          navn: g.streetName,
          tekst: `${g.streetName}, ${[g.postalCode, g.postalPlace].filter(Boolean).join(" ")}`,
        })),
        adresser: [],
      });
    }

    // Gaten brukeren valgte gjelder, så sant den er blant treffene på navnet.
    if (valgtGate && gater.some((g) => g.id === valgtGate)) gater = gater.filter((g) => g.id === valgtGate);

    const adresser: BmAdresse[] = [];
    for (const g of gater.slice(0, 5)) {
      const paaGaten = await bm.adresserPaaGate(g.id);
      adresser.push(
        ...paaGaten.filter(
          (a) => a.houseNumber === husnummer && (!bokstav || (a.houseSubNumber ?? "").toUpperCase() === bokstav),
        ),
      );
      if (adresser.length >= 20) break;
    }

    return NextResponse.json({
      gater: [],
      adresser: adresser.slice(0, 20).map((a) => ({
        id: a.id,
        tekst: `${[a.streetName, `${a.houseNumber ?? ""}${a.houseSubNumber ?? ""}`].filter(Boolean).join(" ")}, ${[a.postalCode, a.postalPlace].filter(Boolean).join(" ")}`,
      })),
    });
  } catch (err) {
    return errorResponse(err, err instanceof BoligmappaFeil ? (err.status === 401 || err.status === 400 ? 400 : 502) : 500);
  }
}
