import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { lagerForSkriving } from "@/lib/lager/api";
import { erAdmin } from "@/lib/ordre/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Angrar ei rørsle som er ført for hand: eit påfyll eller ei oppteljing.
 * Den som førte ho, eller ein administrator.
 *
 * Rørsler frå ei leverandørfaktura eller eit uttak til ein ordre blir ikkje
 * sletta her. Dei følgjer kjelda si: løys linja frå bilen, eller slett
 * materiell-linja på ordren, så går rørsla med.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id, mid } = await params;
    const admin = supabaseAdmin();
    const lager = await lagerForSkriving(admin, session, id, { ogsaaInaktiv: true });
    if (lager instanceof NextResponse) return lager;

    const { data: roersle } = await admin
      .from("stock_movements")
      .select("id, invoice_line_id, material_entry_id, created_by")
      .eq("id", mid)
      .eq("location_id", lager.id)
      .eq("company_id", session.companyId)
      .maybeSingle();
    if (!roersle) return NextResponse.json({ error: "Fant ikke bevegelsen" }, { status: 404 });
    if (roersle.invoice_line_id) {
      return NextResponse.json(
        { error: "Varen kom fra en leverandørfaktura. Løs linja under Leverandørfakturaer i stedet." },
        { status: 400 },
      );
    }
    if (roersle.material_entry_id) {
      return NextResponse.json(
        { error: "Varen er tatt ut til en ordre. Slett materiell-linja på ordren, så kommer den tilbake." },
        { status: 400 },
      );
    }
    if (roersle.created_by !== session.userId && !(await erAdmin(admin, session))) {
      return NextResponse.json({ error: "Du kan bare angre det du har ført selv." }, { status: 403 });
    }

    const { error } = await admin.from("stock_movements").delete().eq("id", roersle.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
