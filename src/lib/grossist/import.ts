import type { SupabaseClient } from "@supabase/supabase-js";
import { parseNelfo4, parseRabattfil, type Nelfo4Fil } from "./nelfo4";

/**
 * Én import for alle kilder: script, FTP, opplasting, nattjobb.
 *
 * Fila er hele sortimentet: varer som står i tabellen men ikke i fila, blir
 * inaktive. Varer med status 3 (utgått) blir inaktive. Rabattfila setter
 * rabatt per rabattgruppe og regner nettoprisen om. Uten rabattfil, men med
 * rabatter fra før, regnes nettoprisene om mot de nye listeprisene.
 *
 * Feiler parseren, skrives ingenting. Feiler databasen midt i, kaster vi —
 * og kalleren (jobben eller scriptet) setter grossisten i «feil» med
 * meldingen. Framdriften rapporteres per batch, så en jobb kan vise
 * «12 400 av 58 000».
 */

export interface ImportResultat {
  linjer: number;
  nye: number;
  endra: number;
  utgaatte: number;
  ikkjeIFila: number;
  medRabatt: number;
  aktive: number;
  aatvaringar: string[];
  /** Fra fila: hvem som sendte den, og prisdatoen. */
  selger: string | null;
  prisdato: string | null;
}

export async function importerVarefil(
  admin: SupabaseClient,
  input: {
    companyId: string;
    supplierId: string;
    varefil: Buffer;
    varefilNamn: string;
    rabattfil?: Buffer | null;
    rabattfilNamn?: string | null;
    onProgress?: (done: number, total: number) => void | Promise<void>;
  },
): Promise<ImportResultat> {
  // 1. Les og parse — før noe skrives.
  const fil: Nelfo4Fil = await parseNelfo4(input.varefil, input.varefilNamn);
  const rabatter = input.rabattfil
    ? await parseRabattfil(input.rabattfil, input.rabattfilNamn ?? "rabattfil.txt")
    : null;

  // Kundenummer og selger fra fila, når grossisten mangler dem.
  const { data: grossist } = await admin
    .from("suppliers")
    .select("id, customer_no, seller_id")
    .eq("id", input.supplierId)
    .eq("company_id", input.companyId)
    .maybeSingle();
  if (!grossist) throw new Error("Fant ikke grossisten.");
  const felt: Record<string, string> = {};
  if (!grossist.customer_no && fil.header.customerNo) felt.customer_no = fil.header.customerNo;
  if (!grossist.seller_id && fil.header.sellerId) felt.seller_id = fil.header.sellerId;
  if (Object.keys(felt).length) await admin.from("suppliers").update(felt).eq("id", grossist.id);

  const start = new Date().toISOString();
  const eksisterende = await hentEksisterende(admin, input.supplierId);

  let nye = 0;
  let endra = 0;
  let utgaatte = 0;
  for (const linje of fil.lines) {
    const foer = eksisterende.get(`${linje.itemKind}:${linje.itemNo}`);
    if (!foer) nye += 1;
    else if (foer.list_price_per_unit !== linje.listPricePerUnit || foer.active !== (linje.status !== 3)) endra += 1;
    if (linje.status === 3) utgaatte += 1;
  }

  // Pristilbud (PL) bærer rabatt per linje; en varefil (VL) gjør det ikke,
  // og skal ikke nullstille rabatter fra en tidligere rabattfil. PostgREST
  // krever samme kolonner i hele batchen, så valget tas per fil.
  const erPristilbud = fil.lines.some((l) => l.priceType !== undefined);

  const BATCH = 1000;
  await input.onProgress?.(0, fil.lines.length);
  for (let i = 0; i < fil.lines.length; i += BATCH) {
    const rader = fil.lines.slice(i, i + BATCH).map((l) => ({
      company_id: input.companyId,
      supplier_id: input.supplierId,
      item_kind: l.itemKind,
      item_no: l.itemNo,
      name: l.name,
      unit: l.unit,
      price_unit: l.priceUnit,
      qty_per_price_unit: l.qtyPerPriceUnit,
      list_price: l.listPrice,
      list_price_per_unit: l.listPricePerUnit,
      discount_group: l.discountGroup,
      brand: l.brand,
      product_type: l.productType,
      stocked: l.stocked,
      sales_pack: l.salesPack,
      block_no: l.blockNo,
      gtin: l.gtin ?? null,
      active: l.status !== 3,
      price_date: l.priceDate,
      imported_at: start,
      ...(erPristilbud
        ? { discount_pct: l.discountPct ?? null, net_price_per_unit: l.netPricePerUnit ?? null }
        : {}),
    }));
    const { error } = await admin
      .from("supplier_items")
      .upsert(rader, { onConflict: "supplier_id,item_kind,item_no" });
    if (error) throw new Error(`Batch fra rad ${i + 1} feilet: ${error.message}`);
    await input.onProgress?.(Math.min(i + BATCH, fil.lines.length), fil.lines.length);
  }

  // Alt som ikke ble rørt i denne kjøringen, står ikke i fila lenger.
  const { count: fjerna, error: fjernFeil } = await admin
    .from("supplier_items")
    .update({ active: false }, { count: "exact" })
    .eq("supplier_id", input.supplierId)
    .eq("active", true)
    .lt("imported_at", start);
  if (fjernFeil) throw new Error(`Kunne ikke deaktivere varer utenfor fila: ${fjernFeil.message}`);

  // Rabatt.
  let medRabatt = 0;
  if (rabatter) {
    for (const [gruppe, pct] of rabatter) {
      const { data, error } = await admin.rpc("sett_rabatt", {
        p_supplier: input.supplierId,
        p_gruppe: gruppe,
        p_pct: pct,
      });
      if (error) throw new Error(`Rabatt for gruppe ${gruppe} feilet: ${error.message}`);
      medRabatt += Number(data ?? 0);
    }
  } else if (!erPristilbud) {
    const { data, error } = await admin.rpc("rekn_om_nettoprisar", { p_supplier: input.supplierId });
    if (error) throw new Error(`Kunne ikke regne om nettopriser: ${error.message}`);
    medRabatt = Number(data ?? 0);
  } else {
    medRabatt = fil.lines.filter((l) => l.netPricePerUnit !== undefined).length;
  }

  const { count: aktive } = await admin
    .from("supplier_items")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", input.supplierId)
    .eq("active", true);

  return {
    linjer: fil.lines.length,
    nye,
    endra,
    utgaatte,
    ikkjeIFila: fjerna ?? 0,
    medRabatt,
    aktive: aktive ?? 0,
    aatvaringar: fil.warnings.slice(0, 20),
    selger: fil.header.sellerName || null,
    prisdato: fil.header.fromDate ?? null,
  };
}

/** Kort tekst for suppliers.last_import_note og loggen. */
export function importNotat(r: ImportResultat): string {
  return `${r.aktive.toLocaleString("nb-NO")} varer, ${r.nye.toLocaleString("nb-NO")} nye, ${r.endra.toLocaleString("nb-NO")} endra, ${r.utgaatte.toLocaleString("nb-NO")} utgått, ${r.medRabatt.toLocaleString("nb-NO")} med rabatt`;
}

/** Nøkkel → det vi trenger for å telle nye og endrede. Sidevis, 1 000 om gangen. */
async function hentEksisterende(
  klient: SupabaseClient,
  supplier: string,
): Promise<Map<string, { list_price_per_unit: number; active: boolean }>> {
  const ut = new Map<string, { list_price_per_unit: number; active: boolean }>();
  const SIDE = 1000;
  for (let fra = 0; ; fra += SIDE) {
    const { data, error } = await klient
      .from("supplier_items")
      .select("item_kind, item_no, list_price_per_unit, active")
      .eq("supplier_id", supplier)
      .order("id")
      .range(fra, fra + SIDE - 1);
    if (error) throw new Error(`Kunne ikke lese katalogen: ${error.message}`);
    for (const rad of data ?? []) {
      ut.set(`${rad.item_kind}:${rad.item_no}`, {
        list_price_per_unit: Number(rad.list_price_per_unit),
        active: rad.active,
      });
    }
    if (!data || data.length < SIDE) break;
  }
  return ut;
}
