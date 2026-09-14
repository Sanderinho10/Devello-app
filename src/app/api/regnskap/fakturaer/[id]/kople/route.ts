import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { erKreditnota, fakturaForSkriving } from "@/lib/regnskap/api";
import { koplLinjeTilOrdre, oppdaterFakturaStatus } from "@/lib/regnskap/sync";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Order, SupplierInvoiceLine } from "@/lib/types";

/**
 * Kobler en faktura til en ordre for hånd — hele fakturaen ({ order_id })
 * eller linje for linje ({ lines: [{ line_id, order_id }] }). Samme
 * materiell-oppretting som den automatiske matchingen.
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

    if (erKreditnota(faktura)) {
      return NextResponse.json(
        { error: "Kreditnotaer håndteres manuelt — de kobles ikke til ordrer." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      order_id?: unknown;
      lines?: { line_id?: unknown; order_id?: unknown }[];
    };

    const oensker: { line_id: string | null; order_id: string }[] = [];
    if (typeof body.order_id === "string") {
      oensker.push({ line_id: null, order_id: body.order_id });
    } else if (Array.isArray(body.lines)) {
      for (const l of body.lines) {
        if (typeof l.line_id === "string" && typeof l.order_id === "string") {
          oensker.push({ line_id: l.line_id, order_id: l.order_id });
        }
      }
    }
    if (!oensker.length) {
      return NextResponse.json({ error: "Oppgi order_id eller lines." }, { status: 400 });
    }

    const ordreIds = [...new Set(oensker.map((o) => o.order_id))];
    const { data: ordrar } = await admin
      .from("orders")
      .select("*")
      .eq("company_id", session.companyId)
      .in("id", ordreIds);
    const ordreMap = new Map(((ordrar ?? []) as Order[]).map((o) => [o.id, o]));
    if (ordreMap.size !== ordreIds.length) {
      return NextResponse.json({ error: "Fant ikke ordren." }, { status: 404 });
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

    let kopla = 0;
    for (const linje of (linjer ?? []) as SupplierInvoiceLine[]) {
      if (linje.material_entry_id || linje.status === "kopla") continue;
      const oenske = oensker.find((o) => o.line_id === null || o.line_id === linje.id);
      if (!oenske) continue;
      await koplLinjeTilOrdre(admin, linje, faktura, ordreMap.get(oenske.order_id)!, paaslag);
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
