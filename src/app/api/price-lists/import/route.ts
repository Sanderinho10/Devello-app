import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { parseWorkbook } from "@/lib/pricelist/excel";
import { supabaseAdmin } from "@/lib/supabase/server";
import { insertRows } from "../route";
import type { PriceItemKind } from "@/lib/types";

export const maxDuration = 120;

/** Importerer rader inn i ei liste som alt finst. */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const form = await request.formData();
    const listId = String(form.get("price_list_id") ?? "");
    const replace = String(form.get("mode") ?? "") === "replace";
    const file = form.get("file");

    if (!listId || !(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Både liste og fil er påkravd" },
        { status: 400 },
      );
    }

    const admin = supabaseAdmin();
    const { data: list } = await admin
      .from("price_lists")
      .select("id, kind")
      .eq("id", listId)
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (!list) {
      return NextResponse.json({ error: "Fann ikkje prislista" }, { status: 404 });
    }

    const parsed = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "Fila kunne ikkje lesast", details: parsed.errors },
        { status: 400 },
      );
    }

    // Erstatt slettar fyrst, men berre etter at fila er validert — elles kunne ei
    // ugyldig fil tømt lista utan å fylle den igjen.
    if (replace) {
      const { error } = await admin
        .from("price_list_items")
        .delete()
        .eq("price_list_id", list.id);
      if (error) throw new Error(error.message);
    }

    await insertRows(
      admin,
      session.companyId,
      list.id,
      list.kind as PriceItemKind,
      parsed.rows,
    );

    return NextResponse.json({
      imported: parsed.rows.length,
      skipped: parsed.skipped,
      replaced: replace,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
