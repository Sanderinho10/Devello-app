import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { parseWorkbook, type ParsedRow } from "@/lib/pricelist/excel";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { PriceItemKind } from "@/lib/types";

export const maxDuration = 120;

/**
 * Oppretter en prisliste, med valgfri import fra en Excel-fil.
 *
 * Filen blir lest og validert FØR listen blir opprettet. En fil med feil skal ikke
 * etterlate seg en tom liste brukeren må rydde vekk.
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
        { error: "Navn og type er påkrevd" },
        { status: 400 },
      );
    }

    let rows: ParsedRow[] = [];
    let skipped = 0;

    if (file instanceof File && file.size > 0) {
      const parsed = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
      if (parsed.errors.length > 0) {
        return NextResponse.json(
          { error: "Filen kunne ikke leses", details: parsed.errors },
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
  if (!body.id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

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
  if (!id) return NextResponse.json({ error: "Mangler id" }, { status: 400 });

  // Prisradene i listen forsvinner med den — det er cascade på fremmednøkkelen.
  const { error } = await supabaseAdmin()
    .from("price_lists")
    .delete()
    .eq("id", id)
    .eq("company_id", session.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Skriver radene i porsjoner. En ekte prisliste kan ha flere tusen rader, og et
 * enkelt insert med alle på en gang sprenger både minne og kroppsgrensen.
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
    if (error) throw new Error(`Import feilet på rad ${start + 1}: ${error.message}`);
  }
}
