import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { hentBehaldning, lagerForSkriving } from "@/lib/lager/api";
import { round3, teljedifferanse } from "@/lib/lager/behaldning";
import { tal } from "@/lib/ordre/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Varer inn i bilen for hand, og oppteljing.
 *
 * { type: "inn", supplier_item_id | name, quantity, … } legg varer i bilen:
 * påfyll frå hovudlageret, eller det som låg der då bilen vart oppretta.
 * Frå katalogen blir elnummer, namn, eining og kostpris kopierte inn, som
 * for materiell på ein ordre.
 *
 * { type: "telling", key, counted } set behaldninga til det som vart talt.
 * Det blir lagra som ei justering på differansen, så historikken viser kva
 * som vart retta og kven som gjorde det.
 *
 * Uttak til ein ordre går ikkje her — dei kjem av seg sjølve når montøren
 * fører materiell «frå bil» på ordren.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const lager = await lagerForSkriving(admin, session, id);
    if (lager instanceof NextResponse) return lager;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

    if (body.type === "telling") {
      const counted = tal(body.counted);
      if (counted === null || counted < 0) {
        return NextResponse.json({ error: "Skriv hvor mange som ligger i bilen." }, { status: 400 });
      }
      const varer = await hentBehaldning(admin, session.companyId, lager.id, { medTomme: true });
      const vare = varer.find((v) => v.key === body.key);
      if (!vare) return NextResponse.json({ error: "Fant ikke varen i bilen." }, { status: 404 });

      const diff = teljedifferanse(vare.quantity, counted);
      if (diff === 0) return NextResponse.json({ ok: true, uendra: true });

      const { data, error } = await admin
        .from("stock_movements")
        .insert({
          company_id: session.companyId,
          location_id: lager.id,
          kind: "justering",
          supplier_item_id: vare.supplier_item_id,
          item_no: vare.item_no,
          name: vare.name,
          unit: vare.unit,
          quantity: diff,
          cost_price: vare.cost_price,
          note: note ?? `Telt: ${counted.toLocaleString("nb-NO")} (sto ${vare.quantity.toLocaleString("nb-NO")})`,
          created_by: session.userId,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json(data, { status: 201 });
    }

    if (body.type !== "inn") {
      return NextResponse.json({ error: "Ukjent type. Bruk «inn» eller «telling»." }, { status: 400 });
    }

    const quantity = tal(body.quantity);
    if (quantity === null || quantity <= 0) {
      return NextResponse.json({ error: "Mengden må være større enn 0." }, { status: 400 });
    }

    let vare: { supplier_item_id: string | null; item_no: string | null; name: string; unit: string; cost_price: number | null };
    if (typeof body.supplier_item_id === "string" && body.supplier_item_id) {
      const { data: treff } = await admin
        .from("supplier_items")
        .select("id, item_no, name, unit, list_price_per_unit, net_price_per_unit")
        .eq("id", body.supplier_item_id)
        .eq("company_id", session.companyId)
        .eq("active", true)
        .maybeSingle();
      if (!treff) return NextResponse.json({ error: "Fant ikke varen i katalogen." }, { status: 404 });
      vare = {
        supplier_item_id: treff.id,
        item_no: treff.item_no,
        name: treff.name,
        unit: treff.unit,
        cost_price: Number(treff.net_price_per_unit ?? treff.list_price_per_unit),
      };
    } else {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return NextResponse.json({ error: "Varen må ha et navn." }, { status: 400 });
      const kost = tal(body.cost_price);
      if (kost !== null && kost < 0) return NextResponse.json({ error: "Ugyldig kostpris." }, { status: 400 });
      vare = {
        supplier_item_id: null,
        item_no: typeof body.item_no === "string" && body.item_no.trim() ? body.item_no.trim() : null,
        name,
        unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "stk",
        cost_price: kost,
      };
    }

    const { data, error } = await admin
      .from("stock_movements")
      .insert({
        ...vare,
        company_id: session.companyId,
        location_id: lager.id,
        kind: "inn",
        quantity: round3(quantity),
        note,
        created_by: session.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
