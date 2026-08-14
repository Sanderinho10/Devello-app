import { NextResponse, type NextRequest } from "next/server";
import { sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name || !body.kind) {
    return NextResponse.json({ error: "Namn og type er påkravd" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("price_lists")
    .insert({
      company_id: session.companyId,
      kind: body.kind,
      name,
      description: body.description?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Manglar id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.name === "string") patch.name = body.name.trim();
  if ("description" in body) patch.description = body.description?.trim() || null;

  const { error } = await supabaseAdmin()
    .from("price_lists")
    .update(patch)
    .eq("id", body.id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Manglar id" }, { status: 400 });

  // Prisradene i lista forsvinn med den — det er cascade på framandnøkkelen.
  const { error } = await supabaseAdmin()
    .from("price_lists")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
