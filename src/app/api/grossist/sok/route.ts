import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SupplierItem } from "@/lib/types";

/**
 * Søk i grossistkatalogen.
 *
 *   GET /api/grossist/sok?q=stikk&limit=20
 *
 * Bare siffer → prefiks på varenummer (montøren har elnummeret fra
 * pakkseddelen). Ellers trigram på navnet. Sorteringen skjer i Postgres
 * (sok_grossistvarer), der indeksene er — 200 000 rader er for mange å
 * sortere her.
 */
export interface SokTreff {
  id: string;
  supplier_name: string;
  item_no: string;
  name: string;
  unit: string;
  list_price_per_unit: number;
  net_price_per_unit: number | null;
}

export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 20));
    if (!q) return NextResponse.json({ items: [] });

    const [{ data: treff, error }, { data: grossistar }] = await Promise.all([
      admin.rpc("sok_grossistvarer", { p_company: session.companyId, p_q: q, p_limit: limit }),
      admin.from("suppliers").select("id, name").eq("company_id", session.companyId),
    ]);
    if (error) throw new Error(error.message);

    const navn = new Map((grossistar ?? []).map((g) => [g.id, g.name as string]));
    const items: SokTreff[] = ((treff ?? []) as SupplierItem[]).map((v) => ({
      id: v.id,
      supplier_name: navn.get(v.supplier_id) ?? "",
      item_no: v.item_no,
      name: v.name,
      unit: v.unit,
      list_price_per_unit: Number(v.list_price_per_unit),
      net_price_per_unit: v.net_price_per_unit === null ? null : Number(v.net_price_per_unit),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
