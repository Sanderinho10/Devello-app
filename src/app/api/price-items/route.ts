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
