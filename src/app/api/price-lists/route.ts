import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { parseWorkbook, type ParsedRow } from "@/lib/pricelist/excel";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PriceItemKind } from "@/lib/types";

export const maxDuration = 120;

/**
 * Opprettar ei prisliste, med valfri import frå ei Excel-fil.
 *
 * Fila blir lest og validert FØR lista blir oppretta. Ei fil med feil skal ikkje
 * etterlate seg ei tom liste brukaren må rydde vekk.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const kind = String(form.get("kind") ?? "") as PriceItemKind;
    const description = String(form.get("description") ?? "").trim();
    const file = form.get("file");

    if (!name || !kind) {
      return NextResponse.json(
        { error: "Namn og type er påkravd" },
        { status: 400 },
      );
    }

    let rows: ParsedRow[] = [];
    let skipped = 0;

    if (file instanceof File && file.size > 0) {
      const parsed = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
      if (parsed.errors.length > 0) {
        return NextResponse.json(
          { error: "Fila kunne ikkje lesast", details: parsed.errors },
          { status: 400 },
        );
      }
      rows = parsed.rows;
      skipped = parsed.skipped;
    }

    const admin = supabaseAdmin();
    const { data: list, error } = await admin
      .from("price_lists")
      .insert({
        company_id: session.companyId,
        kind,
        name,
        description: description || null,
      })
      .select("id, kind")
      .single();

    if (error) throw new Error(error.message);

    if (rows.length > 0) {
      await insertRows(admin, session.companyId, list.id, list.kind, rows);
    }

    return NextResponse.json({ id: list.id, imported: rows.length, skipped });
  } catch (err) {
    return errorResponse(err);
  }
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

/**
 * Skriv radene i porsjonar. Ei ekte prisliste kan ha fleire tusen rader, og eit
 * enkelt insert med alle på ein gong sprenger både minne og kroppsgrensa.
 */
export async function insertRows(
  admin: SupabaseClient,
  companyId: string,
  listId: string,
  kind: PriceItemKind,
  rows: ParsedRow[],
): Promise<void> {
  const CHUNK = 500;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK).map((row) => ({
      company_id: companyId,
      price_list_id: listId,
      kind,
      name: row.name,
      code: row.code,
      description: row.description,
      unit: row.unit,
      unit_price: row.unit_price,
      includes_labour: kind !== "materiell",
      includes_material: kind !== "time",
    }));
    const { error } = await admin.from("price_list_items").insert(chunk);
    if (error) throw new Error(`Import feila på rad ${start + 1}: ${error.message}`);
  }
}
