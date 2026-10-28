import type { SupabaseClient } from "@supabase/supabase-js";
import { hentFakturafiler } from "./ftp-faktura";
import { synkroniserFakturaer } from "./sync";

/**
 * Alle leverandørfakturaer inn i én liste, fra begge kildene:
 *
 *   - PowerOffice Go, når selskapet har en regnskapskobling.
 *   - Fakturafilene på FTP-området til hver grossist som har et
 *     fakturafil-mønster satt opp.
 *
 * Begge skriver til supplier_invoices og kobles til ordrene på samme måte.
 * Samme faktura sett fra begge kildene blir merket som duplikat (finnDuplikat),
 * så materiellet ikke kommer to ganger. Det er dette «Hent fakturaer nå» på
 * Leverandørfakturaer kaller.
 */
export interface HentAlleResultat {
  /** Fantes det noen kilde å hente fra? */
  harKilde: boolean;
  henta: number;
  nye: number;
  kopla: number;
  delvis: number;
  ukopla: number;
  duplikat: number;
  feil: string[];
}

export async function hentAlleLeverandorfakturaer(
  admin: SupabaseClient,
  companyId: string,
): Promise<HentAlleResultat> {
  const r: HentAlleResultat = { harKilde: false, henta: 0, nye: 0, kopla: 0, delvis: 0, ukopla: 0, duplikat: 0, feil: [] };

  // Grossistenes fakturafiler først: kommer samme faktura etterpå fra Go,
  // er det den som blir duplikatet, og varelinjene fra filen står.
  const { data: ftpRader } = await admin
    .from("supplier_ftp")
    .select("supplier_id, suppliers!inner(name)")
    .eq("company_id", companyId)
    .not("fakturafil_pattern", "is", null)
    .neq("fakturafil_pattern", "");
  for (const rad of ftpRader ?? []) {
    r.harKilde = true;
    const s = rad.suppliers as unknown as { name: string } | { name: string }[];
    const navn = (Array.isArray(s) ? s[0]?.name : s?.name) ?? "Grossist";
    try {
      const f = await hentFakturafiler(admin, rad.supplier_id as string, { trigger: "manuell" });
      r.henta += f.fakturaer + f.duplikat;
      r.nye += f.fakturaer;
      r.kopla += f.kopla;
      r.delvis += f.delvis;
      r.ukopla += f.ukopla;
      r.duplikat += f.duplikat;
      r.feil.push(...f.feil.map((e) => `${navn}: ${e}`));
    } catch (err) {
      r.feil.push(`${navn}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const go = await synkroniserFakturaer(companyId, { trigger: "manuell" });
    if (!go.ikkeTilkoblet) {
      r.harKilde = true;
      r.henta += go.henta;
      r.nye += go.nye;
      r.kopla += go.kopla;
      r.delvis += go.delvis;
      r.ukopla += go.ukopla;
      r.feil.push(...go.feil.map((e) => `PowerOffice Go: ${e}`));
    }
  } catch (err) {
    r.harKilde = true;
    r.feil.push(`PowerOffice Go: ${err instanceof Error ? err.message : String(err)}`);
  }

  return r;
}
