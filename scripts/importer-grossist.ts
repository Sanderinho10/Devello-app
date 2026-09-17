/**
 * Importerer en grossists varefil (EFO/NELFO 4.0) til katalogen.
 *
 *   npm run grossist:importer -- --selskap <company_id> --grossist "Onninen" \
 *       --varefil ./V4varefil.zip [--rabattfil ./R4rabatt.txt] [--kundenr 123456]
 *
 * Krever .env.local med NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.
 *
 * Fila er hele sortimentet: varer som står i tabellen men ikke i fila, blir
 * inaktive. Varer med status 3 (utgått) blir inaktive. Rabattfila setter
 * rabatt per rabattgruppe og regner nettoprisen om. Uten rabattfil, men med
 * rabatter fra før, regnes nettoprisene om mot de nye listeprisene.
 *
 * Feiler parseren, skrives ingenting. Feiler databasen midt i, står
 * grossisten med status «feil» og feilmeldingen i notatet.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseNelfo4, parseRabattfil, type Nelfo4Fil } from "@/lib/grossist/nelfo4";

// ---------------------------------------------------------------------------
// Argumenter
// ---------------------------------------------------------------------------

const args = lesArgs(process.argv.slice(2));
const companyId = args.selskap;
const grossistNavn = args.grossist;
const varefilSti = args.varefil;
const rabattfilSti = args.rabattfil;
const kundenr = args.kundenr;

if (!companyId || !grossistNavn || !varefilSti) {
  console.error(
    "Bruk: npm run grossist:importer -- --selskap <company_id> --grossist <navn> --varefil <fil> [--rabattfil <fil>] [--kundenr <nr>]",
  );
  process.exit(1);
}

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    console.error(`Mangler ${key}. Kjør via «npm run grossist:importer» så .env.local blir lest.`);
    process.exit(1);
  }
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// 1. Les og parse — før noe skrives
// ---------------------------------------------------------------------------

let fil: Nelfo4Fil;
try {
  const bytes = await readFile(varefilSti);
  fil = await parseNelfo4(bytes, path.basename(varefilSti));
} catch (err) {
  console.error("Kunne ikke lese varefila:", err instanceof Error ? err.message : err);
  process.exit(1);
}

let rabatter: Map<string, number> | null = null;
if (rabattfilSti) {
  try {
    rabatter = await parseRabattfil(await readFile(rabattfilSti), path.basename(rabattfilSti));
  } catch (err) {
    console.error("Kunne ikke lese rabattfila:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

console.log(
  `Leste ${fil.lines.length} varelinjer fra ${fil.header.sellerName || "(ukjent selger)"}` +
    ` (${fil.header.format} ${fil.header.versjon}, prisdato ${fil.header.fromDate ?? "ukjent"}).`,
);

// ---------------------------------------------------------------------------
// 2. Grossisten
// ---------------------------------------------------------------------------

const { data: company } = await admin.from("companies").select("id, name").eq("id", companyId).maybeSingle();
if (!company) {
  console.error(`Fant ikke selskap ${companyId}.`);
  process.exit(1);
}

const supplierId = await finnEllerOpprettGrossist(admin, companyId, grossistNavn, {
  customerNo: kundenr ?? fil.header.customerNo ?? null,
  sellerId: fil.header.sellerId || null,
});
console.log(`Grossist «${grossistNavn}» hos ${company.name} (${supplierId}).`);

// ---------------------------------------------------------------------------
// 3. Upsert i batcher
// ---------------------------------------------------------------------------

const start = new Date().toISOString();
try {
  const eksisterende = await hentEksisterende(admin, supplierId);

  let nye = 0;
  let endra = 0;
  let utgaatt = 0;
  for (const linje of fil.lines) {
    const foer = eksisterende.get(`${linje.itemKind}:${linje.itemNo}`);
    if (!foer) nye += 1;
    else if (foer.list_price_per_unit !== linje.listPricePerUnit || foer.active !== (linje.status !== 3)) endra += 1;
    if (linje.status === 3) utgaatt += 1;
  }

  // Pristilbud (PL) bærer rabatt per linje; en varefil (VL) gjør det ikke,
  // og skal ikke nullstille rabatter fra en tidligere rabattfil. PostgREST
  // krever samme kolonner i hele batchen, så valget tas per fil.
  const erPristilbud = fil.lines.some((l) => l.priceType !== undefined);

  const BATCH = 1000;
  for (let i = 0; i < fil.lines.length; i += BATCH) {
    const rader = fil.lines.slice(i, i + BATCH).map((l) => ({
      company_id: companyId,
      supplier_id: supplierId,
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
    process.stdout.write(`\r  ${Math.min(i + BATCH, fil.lines.length)} / ${fil.lines.length}`);
  }
  process.stdout.write("\n");

  // Alt som ikke ble rørt i denne kjøringen, står ikke i fila lenger.
  const { count: fjerna, error: fjernFeil } = await admin
    .from("supplier_items")
    .update({ active: false }, { count: "exact" })
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .lt("imported_at", start);
  if (fjernFeil) throw new Error(`Kunne ikke deaktivere varer utenfor fila: ${fjernFeil.message}`);

  // 4. Rabatt
  let medRabatt = 0;
  if (rabatter) {
    for (const [gruppe, pct] of rabatter) {
      const { data, error } = await admin.rpc("sett_rabatt", {
        p_supplier: supplierId,
        p_gruppe: gruppe,
        p_pct: pct,
      });
      if (error) throw new Error(`Rabatt for gruppe ${gruppe} feilet: ${error.message}`);
      medRabatt += Number(data ?? 0);
    }
  } else if (!erPristilbud) {
    const { data, error } = await admin.rpc("rekn_om_nettoprisar", { p_supplier: supplierId });
    if (error) throw new Error(`Kunne ikke regne om nettopriser: ${error.message}`);
    medRabatt = Number(data ?? 0);
  } else {
    medRabatt = fil.lines.filter((l) => l.netPricePerUnit !== undefined).length;
  }

  const { count: aktive } = await admin
    .from("supplier_items")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId)
    .eq("active", true);

  // 5. Status på grossisten
  const notat = `${(aktive ?? 0).toLocaleString("nb-NO")} varer, ${medRabatt.toLocaleString("nb-NO")} med rabatt`;
  await admin
    .from("suppliers")
    .update({ last_import_at: start, last_import_status: "ok", last_import_note: notat })
    .eq("id", supplierId);

  console.log(`Linjer i fila:      ${fil.lines.length}`);
  console.log(`Nye:                ${nye}`);
  console.log(`Endret:             ${endra}`);
  console.log(`Utgått (status 3):  ${utgaatt}`);
  console.log(`Ikke i fila lenger: ${fjerna ?? 0}`);
  console.log(`Med rabatt:         ${medRabatt}`);
  console.log(`Aktive nå:          ${aktive ?? 0}`);
  if (fil.warnings.length) {
    console.log(`\n${fil.warnings.length} advarsler, de fem første:`);
    for (const w of fil.warnings.slice(0, 5)) console.log(`  - ${w}`);
  }
} catch (err) {
  const melding = err instanceof Error ? err.message : String(err);
  await admin
    .from("suppliers")
    .update({ last_import_at: start, last_import_status: "feil", last_import_note: melding.slice(0, 500) })
    .eq("id", supplierId);
  console.error("Importen feilet:", melding);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------------

function lesArgs(argv: string[]): Record<string, string | undefined> {
  const ut: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const navn = a.slice(2);
      const verdi = argv[i + 1];
      if (verdi && !verdi.startsWith("--")) {
        ut[navn] = verdi;
        i += 1;
      } else {
        ut[navn] = "true";
      }
    }
  }
  return ut;
}

async function finnEllerOpprettGrossist(
  klient: SupabaseClient,
  company: string,
  navn: string,
  info: { customerNo: string | null; sellerId: string | null },
): Promise<string> {
  const { data: finst } = await klient
    .from("suppliers")
    .select("id")
    .eq("company_id", company)
    .eq("name", navn)
    .maybeSingle();

  const felt = {
    ...(info.customerNo ? { customer_no: info.customerNo } : {}),
    ...(info.sellerId ? { seller_id: info.sellerId } : {}),
  };

  if (finst) {
    if (Object.keys(felt).length) await klient.from("suppliers").update(felt).eq("id", finst.id);
    return finst.id;
  }
  const { data, error } = await klient
    .from("suppliers")
    .insert({ company_id: company, name: navn, ...felt })
    .select("id")
    .single();
  if (error) throw new Error(`Kunne ikke opprette grossist: ${error.message}`);
  return data.id;
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
