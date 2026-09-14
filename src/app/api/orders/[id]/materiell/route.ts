import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreForSkriving, tal } from "@/lib/ordre/api";
import { round2, salspris } from "@/lib/ordre/summering";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Fører materiell på en ordre.
 *
 * Fra katalogen: elnummer, navn, enhet og kostpris (netto, ellers liste)
 * kopieres inn, og salgsprisen regnes fra selskapets standardpåslag — eller
 * påslaget i body-en, når montøren overstyrer på linja. Fritekst: navn og
 * salgspris må inn, kostpris er valgfri.
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
    const order = await ordreForSkriving(admin, session, id);
    if (order instanceof NextResponse) return order;

    const body = (await request.json().catch(() => ({}))) as {
      supplier_item_id?: unknown;
      name?: unknown;
      unit?: unknown;
      quantity?: unknown;
      cost_price?: unknown;
      markup_pct?: unknown;
      sale_price?: unknown;
      note?: unknown;
    };

    const quantity = tal(body.quantity);
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ error: "Mengden må være større enn 0." }, { status: 400 });
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

    if (typeof body.supplier_item_id === "string" && body.supplier_item_id) {
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
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
