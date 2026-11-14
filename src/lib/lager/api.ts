import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import type { SessionContext } from "@/lib/supabase/server";
import type { StockLocation, StockMovement, SupplierInvoice, SupplierInvoiceLine } from "@/lib/types";
import { reknBehaldning, type Lagervare } from "./behaldning";

/**
 * Felles for rutene som les og skriv på ein bil.
 *
 * Same rekkjefølgje som ordreForSkriving: modulen er på (403), bilen er
 * selskapet sin (404). Ein bil som er teken ut av bruk tek ikkje imot nye
 * rørsler (400) — historikken står.
 */
export async function lagerForSkriving(
  admin: SupabaseClient,
  session: SessionContext,
  locationId: string,
  opts: { ogsaaInaktiv?: boolean } = {},
): Promise<StockLocation | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data } = await admin
    .from("stock_locations")
    .select("*")
    .eq("id", locationId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Fant ikke bilen" }, { status: 404 });
  const lager = data as StockLocation;
  if (!lager.active && !opts.ogsaaInaktiv) {
    return NextResponse.json({ error: `${lager.name} er tatt ut av bruk.` }, { status: 400 });
  }
  return lager;
}

/** Alle rørslene i ein bil, eldste først. Bilar har tusenvis, ikkje millionar. */
export async function hentRoersler(
  admin: SupabaseClient,
  companyId: string,
  /** Utan: alle bilane i selskapet, til oversikta. */
  locationId?: string,
): Promise<StockMovement[]> {
  const alle: StockMovement[] = [];
  const side = 1000;
  for (let fra = 0; ; fra += side) {
    let sporring = admin.from("stock_movements").select("*").eq("company_id", companyId);
    if (locationId) sporring = sporring.eq("location_id", locationId);
    const { data, error } = await sporring
      .order("created_at")
      .order("id")
      .range(fra, fra + side - 1);
    if (error) throw new Error(error.message);
    alle.push(...((data ?? []) as StockMovement[]));
    if (!data || data.length < side) break;
  }
  return alle;
}

export async function hentBehaldning(
  admin: SupabaseClient,
  companyId: string,
  locationId: string,
  opts: { medTomme?: boolean } = {},
): Promise<Lagervare[]> {
  return reknBehaldning(await hentRoersler(admin, companyId, locationId), opts);
}

/**
 * Legg ei fakturalinje på bilen: éi rørsle inn, med kostprisen frå fakturaen.
 * Ingen materiell — varene er ikkje brukte på nokon jobb enno.
 */
export async function koplLinjeTilLager(
  admin: SupabaseClient,
  linje: SupplierInvoiceLine,
  faktura: Pick<SupplierInvoice, "invoice_no" | "voucher_no" | "company_id">,
  lager: Pick<StockLocation, "id">,
): Promise<void> {
  const mengde = Number(linje.quantity);
  // Ei linje utan mengde (frakt ført som 0 stk) har ingenting å leggje i bilen.
  if (mengde !== 0) {
    const { error } = await admin.from("stock_movements").insert({
      company_id: faktura.company_id,
      location_id: lager.id,
      kind: "inn",
      supplier_item_id: linje.supplier_item_id,
      item_no: linje.item_no,
      name: linje.name,
      unit: linje.unit,
      quantity: mengde,
      cost_price: Number(linje.unit_price),
      invoice_line_id: linje.id,
      note: `Faktura ${faktura.invoice_no ?? faktura.voucher_no ?? ""}`.trim(),
    });
    if (error) throw new Error(`Kunne ikke legge varen på bilen: ${error.message}`);
  }
  await admin
    .from("supplier_invoice_lines")
    .update({ stock_location_id: lager.id, order_id: null, material_entry_id: null, status: "kopla" })
    .eq("id", linje.id);
}

/** Bilane som kan ta imot varer, med nummeret fakturaen leitar etter. */
export async function aktiveLager(admin: SupabaseClient, companyId: string): Promise<StockLocation[]> {
  const { data } = await admin
    .from("stock_locations")
    .select("*")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("location_no");
  return (data ?? []) as StockLocation[];
}
