/**
 * Importerer en grossists varefil (EFO/NELFO 4.0) til katalogen — fra
 * kommandolinja. Tynt skall rundt src/lib/grossist/import.ts, som er den
 * samme importen FTP-henting, opplasting og nattjobben bruker.
 *
 *   npm run grossist:importer -- --selskap <company_id> --grossist "Onninen" \
 *       --varefil ./V4varefil.zip [--rabattfil ./R4rabatt.txt] [--kundenr 123456]
 *
 * Krever .env.local med NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { importNotat, importerVarefil } from "@/lib/grossist/import";

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

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: company } = await admin.from("companies").select("id, name").eq("id", companyId).maybeSingle();
if (!company) {
  console.error(`Fant ikke selskap ${companyId}.`);
  process.exit(1);
}
const supplierId = await finnEllerOpprettGrossist(admin, companyId, grossistNavn, kundenr ?? null);
console.log(`Grossist «${grossistNavn}» hos ${company.name} (${supplierId}).`);

const { data: jobb } = await admin
  .from("import_jobs")
  .insert({ company_id: companyId, supplier_id: supplierId, source: "script", status: "importerer", started_at: new Date().toISOString(), varefil_name: path.basename(varefilSti), rabattfil_name: rabattfilSti ? path.basename(rabattfilSti) : null })
  .select("id")
  .single();

try {
  const resultat = await importerVarefil(admin, {
    companyId,
    supplierId,
    varefil: await readFile(varefilSti),
    varefilNamn: path.basename(varefilSti),
    rabattfil: rabattfilSti ? await readFile(rabattfilSti) : null,
    rabattfilNamn: rabattfilSti ? path.basename(rabattfilSti) : null,
    onProgress: (done, total) => {
      process.stdout.write(`\r  ${done} / ${total}`);
    },
  });
  process.stdout.write("\n");
  const naa = new Date().toISOString();
  await admin
    .from("suppliers")
    .update({ last_import_at: naa, last_import_status: "ok", last_import_note: importNotat(resultat) })
    .eq("id", supplierId);
  if (jobb) await admin.from("import_jobs").update({ status: "ferdig", finished_at: naa, result: resultat, progress_done: resultat.linjer, progress_total: resultat.linjer }).eq("id", jobb.id);

  console.log(`Linjer i fila:      ${resultat.linjer}`);
  console.log(`Nye:                ${resultat.nye}`);
  console.log(`Endret:             ${resultat.endra}`);
  console.log(`Utgått (status 3):  ${resultat.utgaatte}`);
  console.log(`Ikke i fila lenger: ${resultat.ikkjeIFila}`);
  console.log(`Med rabatt:         ${resultat.medRabatt}`);
  console.log(`Aktive nå:          ${resultat.aktive}`);
  if (resultat.aatvaringar.length) {
    console.log(`\n${resultat.aatvaringar.length} advarsler, de fem første:`);
    for (const w of resultat.aatvaringar.slice(0, 5)) console.log(`  - ${w}`);
  }
} catch (err) {
  const melding = err instanceof Error ? err.message : String(err);
  const naa = new Date().toISOString();
  await admin.from("suppliers").update({ last_import_at: naa, last_import_status: "feil", last_import_note: melding.slice(0, 500) }).eq("id", supplierId);
  if (jobb) await admin.from("import_jobs").update({ status: "feil", finished_at: naa, error: melding.slice(0, 500) }).eq("id", jobb.id);
  console.error("Importen feilet:", melding);
  process.exit(1);
}

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

async function finnEllerOpprettGrossist(klient: SupabaseClient, company: string, navn: string, customerNo: string | null): Promise<string> {
  const { data: finst } = await klient.from("suppliers").select("id").eq("company_id", company).eq("name", navn).maybeSingle();
  if (finst) {
    if (customerNo) await klient.from("suppliers").update({ customer_no: customerNo }).eq("id", finst.id);
    return finst.id;
  }
  const { data, error } = await klient
    .from("suppliers")
    .insert({ company_id: company, name: navn, ...(customerNo ? { customer_no: customerNo } : {}) })
    .select("id")
    .single();
  if (error) throw new Error(`Kunne ikke opprette grossist: ${error.message}`);
  return data.id;
}
