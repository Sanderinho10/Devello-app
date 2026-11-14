import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { registrerAppBrukar } from "@/lib/billing/subscription";
import { hentBehaldning, lagerForSkriving } from "@/lib/lager/api";
import type { Lagervare } from "@/lib/lager/behaldning";
import { erUnikBrot, finstMedClientId, ordreForSkriving, tal, uuid } from "@/lib/ordre/api";
import { round2, salspris } from "@/lib/ordre/summering";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { StockLocation } from "@/lib/types";

/**
 * Fører materiell på en ordre.
 *
 * Fra katalogen: elnummer, navn, enhet og kostpris (netto, ellers liste)
 * kopieres inn, og salgsprisen regnes fra selskapets standardpåslag — eller
 * påslaget i body-en, når montøren overstyrer på linja. Fritekst: navn og
 * salgspris må inn, kostpris er valgfri.
 *
 * Fra bil: med stock_location_id trekkes mengden fra bilens beholdning i
 * samme kall. stock_key peker på en vare som ligger i bilen (navn, enhet og
 * siste innpris kopieres derfra); uten den brukes katalogen eller
 * friteksten som ellers, og bilen går i minus om varen aldri ble ført inn.
 * Det er lov — montøren skal ikke stoppes ute på jobb av et lagertall.
 *
 * Ingen hendelse i ordreloggen per linje — det ville druknet
 * statusendringene.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const body = (await request.json().catch(() => ({}))) as {
      supplier_item_id?: unknown;
      name?: unknown;
      unit?: unknown;
      quantity?: unknown;
      cost_price?: unknown;
      markup_pct?: unknown;
      sale_price?: unknown;
      note?: unknown;
      client_id?: unknown;
      stock_location_id?: unknown;
      stock_key?: unknown;
    };

    // Montørappen: samme client_id igjen → samme rad, 200.
    const clientId = uuid(body.client_id);
    if (clientId) {
      const avvist = await ordreModulEllers403(admin, session.companyId);
      if (avvist) return avvist;
      const finst = await finstMedClientId<{ order_id: string }>(admin, "material_entries", session.companyId, clientId);
      if (finst && finst.order_id === id) return NextResponse.json(finst, { status: 200 });
    }

    const order = await ordreForSkriving(admin, session, id);
    if (order instanceof NextResponse) return order;

    const quantity = tal(body.quantity);
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ error: "Mengden må være større enn 0." }, { status: 400 });
    }

    let lager: StockLocation | null = null;
    let lagervare: Lagervare | null = null;
    if (typeof body.stock_location_id === "string" && body.stock_location_id) {
      const l = await lagerForSkriving(admin, session, body.stock_location_id);
      if (l instanceof NextResponse) return l;
      lager = l;
      if (typeof body.stock_key === "string" && body.stock_key) {
        const varer = await hentBehaldning(admin, session.companyId, lager.id, { medTomme: true });
        lagervare = varer.find((v) => v.key === body.stock_key) ?? null;
        if (!lagervare) {
          return NextResponse.json({ error: `Fant ikke varen i ${lager.name}.` }, { status: 404 });
        }
      }
    }

    const { data: company } = await admin
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session.companyId)
      .single();
    const standardPaaslag = Number(company?.materials_markup_pct ?? 25);
    const paaslagFraBody = tal(body.markup_pct);
    if (paaslagFraBody !== null && (paaslagFraBody < -100 || paaslagFraBody > 1000)) {
      return NextResponse.json({ error: "Påslaget er utenfor rimelig område." }, { status: 400 });
    }
    const markup = paaslagFraBody ?? standardPaaslag;

    let linje: {
      supplier_item_id: string | null;
      item_no: string | null;
      name: string;
      unit: string;
      cost_price: number | null;
      markup_pct: number;
      sale_price: number;
    };

    if (lagervare) {
      // Varen slik den ligger i bilen: siste innpris er kostprisen.
      const sal = tal(body.sale_price);
      if (lagervare.cost_price === null && sal === null) {
        return NextResponse.json(
          { error: "Varen har ingen kostpris i bilen. Oppgi salgspris." },
          { status: 400 },
        );
      }
      linje = {
        supplier_item_id: lagervare.supplier_item_id,
        item_no: lagervare.item_no,
        name: lagervare.name,
        unit: lagervare.unit,
        cost_price: lagervare.cost_price,
        markup_pct: markup,
        sale_price: lagervare.cost_price !== null ? salspris(lagervare.cost_price, markup) : round2(sal as number),
      };
    } else if (typeof body.supplier_item_id === "string" && body.supplier_item_id) {
      const { data: vare } = await admin
        .from("supplier_items")
        .select("id, item_no, name, unit, list_price_per_unit, net_price_per_unit")
        .eq("id", body.supplier_item_id)
        .eq("company_id", session.companyId)
        .eq("active", true)
        .maybeSingle();
      if (!vare) {
        return NextResponse.json({ error: "Fant ikke varen i katalogen." }, { status: 404 });
      }
      const kost = Number(vare.net_price_per_unit ?? vare.list_price_per_unit);
      linje = {
        supplier_item_id: vare.id,
        item_no: vare.item_no,
        name: vare.name,
        unit: vare.unit,
        cost_price: kost,
        markup_pct: markup,
        sale_price: salspris(kost, markup),
      };
    } else {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return NextResponse.json({ error: "Linjen må ha et navn." }, { status: 400 });
      }
      const kost = tal(body.cost_price);
      const sal = tal(body.sale_price);
      if (sal === null && kost === null) {
        return NextResponse.json(
          { error: "Oppgi salgspris, eller kostpris så påslaget regner salgsprisen." },
          { status: 400 },
        );
      }
      linje = {
        supplier_item_id: null,
        item_no: null,
        name,
        unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "stk",
        cost_price: kost,
        markup_pct: markup,
        sale_price: sal !== null ? round2(sal) : salspris(kost as number, markup),
      };
    }

    const { data, error } = await admin
      .from("material_entries")
      .insert({
        ...linje,
        company_id: session.companyId,
        order_id: order.id,
        source: "manuell",
        quantity: Math.round(quantity * 1000) / 1000,
        note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
        registered_by: session.userId,
        client_id: clientId,
        ...(lager ? { stock_location_id: lager.id } : {}),
      })
      .select("*")
      .single();
    if (error) {
      if (erUnikBrot(error) && clientId) {
        const finst = await finstMedClientId(admin, "material_entries", session.companyId, clientId);
        if (finst) return NextResponse.json(finst, { status: 200 });
      }
      throw new Error(error.message);
    }

    // Uttaket fra bilen. Feiler det, skal linja ikke stå igjen og påstå at
    // varen kom fra bilen uten at beholdningen gikk ned.
    if (lager) {
      const { error: uttakFeil } = await admin.from("stock_movements").insert({
        company_id: session.companyId,
        location_id: lager.id,
        kind: "uttak",
        supplier_item_id: data.supplier_item_id,
        item_no: data.item_no,
        name: data.name,
        unit: data.unit,
        quantity: -Number(data.quantity),
        cost_price: data.cost_price,
        material_entry_id: data.id,
        note: `Ordre #${order.order_no}`,
        created_by: session.userId,
      });
      if (uttakFeil) {
        await admin.from("material_entries").delete().eq("id", data.id);
        throw new Error(`Kunne ikke trekke varen fra ${lager.name}: ${uttakFeil.message}`);
      }
    }

    // Aktiv montør i appen: telles første gang i måneden, bare fra appen.
    if (session.via === "bearer") await registrerAppBrukar(admin, { companyId: session.companyId, userId: session.userId });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
