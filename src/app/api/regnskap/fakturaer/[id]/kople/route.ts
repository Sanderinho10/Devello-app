import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erKreditnota, fakturaForSkriving } from "@/lib/regnskap/api";
import { koplLinjeTilLager } from "@/lib/lager/api";
import { koplLinjeTilOrdre, oppdaterFakturaStatus } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Order, StockLocation, SupplierInvoiceLine } from "@/lib/types";

/**
 * Kobler en faktura til en ordre for hånd — hele fakturaen ({ order_id })
 * eller linje for linje ({ lines: [{ line_id, order_id }] }). Samme
 * materiell-oppretting som den automatiske matchingen.
 *
 * Varer som skal i en bil og ikke på en jobb kobles med stock_location_id
 * i stedet for order_id, på hele fakturaen eller på linja. Da går de inn i
 * bilens beholdning, uten materiell på noen ordre.
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
    const faktura = await fakturaForSkriving(admin, session, id);
    if (faktura instanceof NextResponse) return faktura;

    if (faktura.duplicate_of) {
      return NextResponse.json(
        { error: "Dette er et duplikat — linjene ligger på originalen. Koble den i stedet." },
        { status: 400 },
      );
    }
    if (erKreditnota(faktura)) {
      return NextResponse.json(
        { error: "Kreditnotaer håndteres manuelt — de kobles ikke til ordrer." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      order_id?: unknown;
      stock_location_id?: unknown;
      lines?: { line_id?: unknown; order_id?: unknown; stock_location_id?: unknown }[];
    };

    // Hvert ønske peker på en ordre eller en bil, aldri begge.
    const oensker: { line_id: string | null; order_id: string | null; stock_location_id: string | null }[] = [];
    if (typeof body.order_id === "string") {
      oensker.push({ line_id: null, order_id: body.order_id, stock_location_id: null });
    } else if (typeof body.stock_location_id === "string") {
      oensker.push({ line_id: null, order_id: null, stock_location_id: body.stock_location_id });
    } else if (Array.isArray(body.lines)) {
      for (const l of body.lines) {
        if (typeof l.line_id !== "string") continue;
        if (typeof l.order_id === "string") {
          oensker.push({ line_id: l.line_id, order_id: l.order_id, stock_location_id: null });
        } else if (typeof l.stock_location_id === "string") {
          oensker.push({ line_id: l.line_id, order_id: null, stock_location_id: l.stock_location_id });
        }
      }
    }
    if (!oensker.length) {
      return NextResponse.json({ error: "Oppgi order_id, stock_location_id eller lines." }, { status: 400 });
    }

    const ordreIds = [...new Set(oensker.map((o) => o.order_id).filter((id): id is string => Boolean(id)))];
    const { data: ordrar } = ordreIds.length
      ? await admin.from("orders").select("*").eq("company_id", session.companyId).in("id", ordreIds)
      : { data: [] };
    const ordreMap = new Map(((ordrar ?? []) as Order[]).map((o) => [o.id, o]));
    if (ordreMap.size !== ordreIds.length) {
      return NextResponse.json({ error: "Fant ikke ordren." }, { status: 404 });
    }

    const lagerIds = [...new Set(oensker.map((o) => o.stock_location_id).filter((id): id is string => Boolean(id)))];
    const { data: lager } = lagerIds.length
      ? await admin.from("stock_locations").select("*").eq("company_id", session.companyId).in("id", lagerIds)
      : { data: [] };
    const lagerMap = new Map(((lager ?? []) as StockLocation[]).map((l) => [l.id, l]));
    if (lagerMap.size !== lagerIds.length) {
      return NextResponse.json({ error: "Fant ikke bilen." }, { status: 404 });
    }
    for (const l of lagerMap.values()) {
      if (!l.active) {
        return NextResponse.json({ error: `${l.name} er tatt ut av bruk.` }, { status: 400 });
      }
    }
    for (const o of ordreMap.values()) {
      if (o.status === "avbrutt") {
        return NextResponse.json({ error: `Ordre #${o.order_no} er avbrutt.` }, { status: 400 });
      }
    }

    const { data: company } = await admin
      .from("companies")
      .select("materials_markup_pct")
      .eq("id", session.companyId)
      .single();
    const paaslag = Number(company?.materials_markup_pct ?? 25);

    const { data: linjer } = await admin
      .from("supplier_invoice_lines")
      .select("*")
      .eq("invoice_id", faktura.id)
      .eq("company_id", session.companyId);

    // Uten linjer (ingen EHF) kobles hodet til ordren, uten materiell.
    if ((linjer ?? []).length === 0) {
      const heile = oensker.find((o) => o.line_id === null);
      if (!heile) {
        return NextResponse.json({ error: "Fakturaen har ingen linjer — koble hele fakturaen." }, { status: 400 });
      }
      await admin
        .from("supplier_invoices")
        .update({ order_id: heile.order_id, stock_location_id: heile.stock_location_id, match_status: "ukopla" })
        .eq("id", faktura.id);
      const status = await oppdaterFakturaStatus(admin, faktura.id);
      return NextResponse.json({ ok: true, kopla: 0, match_status: status });
    }

    let kopla = 0;
    for (const linje of (linjer ?? []) as SupplierInvoiceLine[]) {
      if (linje.material_entry_id || linje.status === "kopla") continue;
      const oenske = oensker.find((o) => o.line_id === null || o.line_id === linje.id);
      if (!oenske) continue;
      if (oenske.order_id) {
        await koplLinjeTilOrdre(admin, linje, faktura, ordreMap.get(oenske.order_id)!, paaslag);
      } else {
        await koplLinjeTilLager(admin, linje, faktura, lagerMap.get(oenske.stock_location_id!)!);
      }
      kopla += 1;
    }

    // Manuell kobling opphever et tidligere «ignorer».
    if (faktura.match_status === "ignorert") {
      await admin.from("supplier_invoices").update({ match_status: "ukopla" }).eq("id", faktura.id);
    }
    const status = await oppdaterFakturaStatus(admin, faktura.id);
    return NextResponse.json({ ok: true, kopla, match_status: status });
  } catch (err) {
    return errorResponse(err);
  }
}
