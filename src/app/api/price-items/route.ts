import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  if (!body.price_list_id) {
    return NextResponse.json({ error: "Mangler prisliste" }, { status: 400 });
  }
  if (!body.name || body.unit_price === undefined || body.unit_price === null) {
    return NextResponse.json(
      { error: "Navn og enhetspris er påkrevd" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  // Typen på raden kommer fra listen, ikke fra klienten. Databasen krever at de er
  // like, så dette er både tilgangssjekk og datakontroll i ett.
  const { data: list } = await admin
    .from("price_lists")
    .select("id, kind")
    .eq("id", body.price_list_id)
    .eq("company_id", session.companyId)
    .maybeSingle();

  if (!list) {
    return NextResponse.json({ error: "Fant ikke prislisten" }, { status: 404 });
  }

  const { error } = await admin.from("price_list_items").insert({
    company_id: session.companyId,
    price_list_id: list.id,
    kind: list.kind,
    code: body.code?.trim() || null,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    unit: body.unit?.trim() || "stk",
    unit_price: body.unit_price,
    // Punktpris er buntet; de andre dekker én ting hver.
    includes_labour: list.kind !== "materiell",
    includes_material: list.kind !== "time",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Rett én rad på stedet. Bare feltene som sendes inn endres.
 *
 * Typen (kind) og lista raden hører til er ikke med: de er bestemt av lista,
 * og en rad som bytter type midt i en aktiv prisliste ville brutt
 * forutsetningen genereringen bygger på.
 */
export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = (await request.json()) as {
    id?: string;
    unit_price?: unknown;
    name?: unknown;
    unit?: unknown;
    code?: unknown;
    description?: unknown;
  };
  if (!body.id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const patch: Record<string, unknown> = {};

  if (body.unit_price !== undefined) {
    const pris = Number(body.unit_price);
    if (!Number.isFinite(pris) || pris < 0) {
      return NextResponse.json({ error: "Prisen må være et tall, 0 eller mer." }, { status: 400 });
    }
    patch.unit_price = pris;
  }
  if (typeof body.name === "string") {
    const navn = body.name.trim();
    if (!navn) return NextResponse.json({ error: "Navn kan ikke være tomt." }, { status: 400 });
    patch.name = navn;
  }
  if (typeof body.unit === "string") patch.unit = body.unit.trim() || "stk";
  if (typeof body.code === "string") patch.code = body.code.trim() || null;
  if (typeof body.description === "string") patch.description = body.description.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Ingenting å endre" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("price_list_items")
    .update(patch)
    .eq("id", body.id)
    // Selskapet kommer fra sesjonen: id-en er ikke tilgang.
    .eq("company_id", session.companyId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Fant ikke raden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("price_list_items")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
