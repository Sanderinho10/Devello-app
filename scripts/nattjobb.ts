/**
 * Nattjobben — det som skal skje av seg selv mens ingen ser på.
 *
 *   npm run nattjobb
 *
 * 1. Henter prisfiler for alle grossister med automatisk henting på, og
 *    importerer dem (samme fil som sist → hopp over).
 * 1b. Henter fakturafiler («autofakt») fra FTP for alle grossister med
 *    fakturafil-mønster satt, og legger linjene på ordrene.
 * 2. Synkroniserer leverandørfakturaer fra PowerOffice Go for alle selskap
 *    med aktiv kopling.
 *
 *   npm run nattjobb -- --berre-fakturaer   → bare 1b
 *
 * Én logglinje per selskap og grossist. Feil stopper ikke resten, men gir
 * exit 1 til slutt så Railway viser kjøringen rød. Kjører som egen
 * Railway-service med cron-plan (se docs/produksjonsoppsett.md).
 */
import { createClient } from "@supabase/supabase-js";
import { koeyrImportJobb } from "@/lib/grossist/jobb";
import { hentFakturafiler } from "@/lib/regnskap/ftp-faktura";
import { synkroniserFakturaer } from "@/lib/regnskap/sync";

// --berre-fakturaer: bare fakturafiler fra FTP — til en ekstra kjøring midt
// på dagen, uten å dra 50 MB prisfil to ganger.
const berreFakturaer = process.argv.includes("--berre-fakturaer");

for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[key]) {
    console.error(`[nattjobb] Mangler ${key}.`);
    process.exit(1);
  }
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let feil = 0;
const start = Date.now();
console.log(`[nattjobb] Start ${new Date().toISOString()}${berreFakturaer ? " (bare fakturafiler)" : ""}`);

type Rad = { supplier_id: string; company_id: string; suppliers: { name: string }; companies: { name: string } };

// ---------------------------------------------------------------------------
// 1. Prisfiler
// ---------------------------------------------------------------------------
const { data: ftpRader } = berreFakturaer
  ? { data: [] }
  : await admin
      .from("supplier_ftp")
      .select("supplier_id, company_id, suppliers!inner(name), companies!inner(name)")
      .eq("auto_import", true);

const perSelskap = new Map<string, Rad[]>();
for (const r of (ftpRader ?? []) as unknown as Rad[]) {
  const liste = perSelskap.get(r.company_id) ?? [];
  liste.push(r);
  perSelskap.set(r.company_id, liste);
}

// Sekvensielt per selskap, maks to selskap samtidig.
const selskap = [...perSelskap.entries()];
let neste = 0;
async function arbeidar() {
  while (neste < selskap.length) {
    const [, rader] = selskap[neste++];
    for (const r of rader) {
      const namn = `${r.companies.name} / ${r.suppliers.name}`;
      try {
        const { data: jobb, error } = await admin
          .from("import_jobs")
          .insert({ company_id: r.company_id, supplier_id: r.supplier_id, source: "nattjobb" })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        const ferdig = await koeyrImportJobb(admin, jobb.id);
        if (ferdig.status === "feil") {
          feil += 1;
          console.log(`[nattjobb] ${namn}: FEIL — ${ferdig.error}`);
        } else if (ferdig.result?.hoppaOver) {
          console.log(`[nattjobb] ${namn}: ingen ny fil (${ferdig.varefil_name})`);
        } else {
          const res = ferdig.result!;
          console.log(
            `[nattjobb] ${namn}: ok — ${res.aktive.toLocaleString("nb-NO")} varer, ${res.nye.toLocaleString("nb-NO")} nye, ${res.endra.toLocaleString("nb-NO")} endra, ${res.utgaatte.toLocaleString("nb-NO")} utgått (${ferdig.varefil_name}${res.prisdato ? ` ${res.prisdato}` : ""})`,
          );
        }
      } catch (err) {
        feil += 1;
        console.log(`[nattjobb] ${namn}: FEIL — ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
await Promise.all([arbeidar(), arbeidar()]);

// ---------------------------------------------------------------------------
// 1b. Fakturafiler fra FTP («autofakt»)
// ---------------------------------------------------------------------------
const { data: fakturaRader } = await admin
  .from("supplier_ftp")
  .select("supplier_id, company_id, suppliers!inner(name), companies!inner(name)")
  .not("fakturafil_pattern", "is", null);

for (const r of (fakturaRader ?? []) as unknown as Rad[]) {
  const namn = `${r.companies.name} / ${r.suppliers.name} fakturaer`;
  try {
    const res = await hentFakturafiler(admin, r.supplier_id, { trigger: "nattjobb" });
    const linje = `${res.filer} filer, ${res.nye} nye, ${res.fakturaer} fakturaer, ${res.kopla} koblet, ${res.ukopla} ukoblet${res.duplikat ? `, ${res.duplikat} duplikat` : ""}`;
    if (res.feil.length) {
      feil += 1;
      console.log(`[nattjobb] ${namn}: ${linje} — FEIL: ${res.feil[0]}`);
    } else {
      console.log(`[nattjobb] ${namn}: ${linje}`);
    }
  } catch (err) {
    feil += 1;
    console.log(`[nattjobb] ${namn}: FEIL — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Leverandørfakturaer
// ---------------------------------------------------------------------------
const { data: koplingar } = berreFakturaer
  ? { data: [] }
  : await admin
      .from("accounting_connections")
      .select("company_id, provider, companies!inner(name)")
      .eq("status", "aktiv");

for (const k of (koplingar ?? []) as unknown as { company_id: string; provider: string; companies: { name: string } }[]) {
  try {
    const r = await synkroniserFakturaer(k.company_id, { trigger: "cron" });
    const linje = `${r.henta} hentet, ${r.nye} nye, ${r.kopla} koblet, ${r.ukopla} ukoblet`;
    if (r.feil.length) {
      feil += 1;
      console.log(`[nattjobb] ${k.companies.name} / ${k.provider}: ${linje} — FEIL: ${r.feil[0]}`);
    } else {
      console.log(`[nattjobb] ${k.companies.name} / ${k.provider}: ${linje}`);
    }
  } catch (err) {
    feil += 1;
    console.log(`[nattjobb] ${k.companies.name} / ${k.provider}: FEIL — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`[nattjobb] Ferdig på ${Math.round((Date.now() - start) / 1000)} s${feil ? `, ${feil} feil` : ""}`);
process.exit(feil ? 1 : 0);
