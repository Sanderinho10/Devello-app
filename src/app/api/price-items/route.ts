import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  if (!body.name || body.unit_price === undefined || body.unit_price === null) {
    return NextResponse.json(
      { error: "Namn og einingspris er påkravd" },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin().from("price_list_items").insert({
    company_id: session.companyId,
    kind: body.kind,
    code: body.code || null,
    name: body.name,
    description: body.description || null,
    unit: body.unit || "stk",
    unit_price: body.unit_price,
    includes_labour: !!body.includes_labour,
    includes_material: !!body.includes_material,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Manglar id" }, { status: 400 });

  const { error } = await supabaseAdmin()
    .from("price_list_items")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
