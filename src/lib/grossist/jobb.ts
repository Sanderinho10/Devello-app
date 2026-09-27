import type { SupabaseClient } from "@supabase/supabase-js";
import { hentNyaste, type FtpOppsett } from "./ftp";
import { importNotat, importerVarefil } from "./import";
import type { ImportJob } from "@/lib/types";

/**
 * Arbeideren: én importjobb fra kø til ferdig.
 *
 *   koe → hentar (FTP: nyeste vare- og rabattfil; opplasting: fra Storage)
 *       → importerer (framdrift per batch) → ferdig med resultat
 *       → eller feil med oversatt melding.
 *
 * Én jobb om gangen per grossist: API-et avviser en ny mens en lever.
 * Startes i bakgrunnen fra API-et (void koeyrImportJobb(...)); nattjobben
 * kaller den direkte og venter. Samme kode begge veier.
 */

export const BUCKET = "supplier-files";

interface FtpRad extends FtpOppsett {
  supplier_id: string;
  varefil_pattern: string;
  rabattfil_pattern: string | null;
  last_varefil_name: string | null;
  last_varefil_mtime: string | null;
  last_rabattfil_name: string | null;
  last_rabattfil_mtime: string | null;
}

export async function koeyrImportJobb(admin: SupabaseClient, jobId: string): Promise<ImportJob> {
  const { data: rad } = await admin.from("import_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!rad) throw new Error(`Fant ikke jobben ${jobId}`);
  const jobb = rad as ImportJob;
  if (jobb.status !== "koe") return jobb;

  const settStatus = async (felt: Partial<ImportJob> & Record<string, unknown>) => {
    await admin.from("import_jobs").update(felt).eq("id", jobb.id);
  };

  const start = new Date().toISOString();
  await settStatus({ status: "hentar", started_at: start, error: null });

  try {
    let varefil: Buffer;
    let varefilNamn: string;
    let rabattfil: Buffer | null = null;
    let rabattfilNamn: string | null = null;
    let ftpRad: FtpRad | null = null;
    let henta: { vare: { name: string; mtime: string | null }; rabatt: { name: string; mtime: string | null } | null } | null = null;

    if (jobb.source === "ftp" || jobb.source === "nattjobb") {
      const { data: f } = await admin
        .from("supplier_ftp")
        .select("*")
        .eq("supplier_id", jobb.supplier_id)
        .eq("company_id", jobb.company_id)
        .maybeSingle();
      if (!f) throw new Error("Grossisten har ikke noe FTP-oppsett.");
      ftpRad = f as FtpRad;

      const vare = await hentNyaste(ftpRad, ftpRad.varefil_pattern);
      if (!vare) throw new Error(`Fant ingen fil som matcher ${ftpRad.varefil_pattern} i ${ftpRad.remote_path || "/"}.`);
      const rabatt = ftpRad.rabattfil_pattern ? await hentNyaste(ftpRad, ftpRad.rabattfil_pattern) : null;

      // Samme fil som sist → ingenting å gjøre. Sammenlignes på navn + mtime,
      // begge for vare- og rabattfil.
      const likVare = vare.fil.name === ftpRad.last_varefil_name && sammeTid(vare.fil.mtime, ftpRad.last_varefil_mtime);
      const likRabatt =
        (rabatt?.fil.name ?? null) === ftpRad.last_rabattfil_name &&
        sammeTid(rabatt?.fil.mtime ?? null, ftpRad.last_rabattfil_mtime);
      if (likVare && likRabatt) {
        const note = `Ingen ny fil: ${vare.fil.name} er alt importert.`;
        await admin
          .from("supplier_ftp")
          .update({ last_fetch_at: start, last_fetch_status: "ingen_ny_fil", last_fetch_note: note })
          .eq("supplier_id", jobb.supplier_id);
        await settStatus({
          status: "ferdig",
          finished_at: new Date().toISOString(),
          varefil_name: vare.fil.name,
          rabattfil_name: rabatt?.fil.name ?? null,
          result: { linjer: 0, nye: 0, endra: 0, utgaatte: 0, ikkjeIFila: 0, medRabatt: 0, aktive: 0, aatvaringar: [], selger: null, prisdato: null, hoppaOver: true },
        });
        return (await hent(admin, jobb.id))!;
      }

      varefil = vare.bytes;
      varefilNamn = vare.fil.name;
      rabattfil = rabatt?.bytes ?? null;
      rabattfilNamn = rabatt?.fil.name ?? null;
      henta = { vare: vare.fil, rabatt: rabatt?.fil ?? null };
      await settStatus({ varefil_name: varefilNamn, rabattfil_name: rabattfilNamn });
    } else {
      if (!jobb.varefil_path) throw new Error("Jobben mangler varefil.");
      varefil = await lesFraStorage(admin, jobb.varefil_path);
      varefilNamn = jobb.varefil_name ?? jobb.varefil_path.split("/").pop() ?? "varefil";
      if (jobb.rabattfil_path) {
        rabattfil = await lesFraStorage(admin, jobb.rabattfil_path);
        rabattfilNamn = jobb.rabattfil_name ?? jobb.rabattfil_path.split("/").pop() ?? "rabattfil";
      }
    }

    await settStatus({ status: "importerer" });
    let sistSkrive = 0;
    const resultat = await importerVarefil(admin, {
      companyId: jobb.company_id,
      supplierId: jobb.supplier_id,
      varefil,
      varefilNamn,
      rabattfil,
      rabattfilNamn,
      onProgress: async (done, total) => {
        // Ikke mer enn én skriving per sekund — framdriften er til for øyet.
        if (done === total || Date.now() - sistSkrive > 1000) {
          sistSkrive = Date.now();
          await admin.from("import_jobs").update({ progress_done: done, progress_total: total }).eq("id", jobb.id);
        }
      },
    });

    const naa = new Date().toISOString();
    await admin
      .from("suppliers")
      .update({ last_import_at: naa, last_import_status: "ok", last_import_note: importNotat(resultat) })
      .eq("id", jobb.supplier_id);
    if (ftpRad && henta) {
      await admin
        .from("supplier_ftp")
        .update({
          last_fetch_at: start,
          last_fetch_status: "ok",
          last_fetch_note: `${henta.vare.name}${henta.rabatt ? ` + ${henta.rabatt.name}` : ""}: ${importNotat(resultat)}`,
          last_varefil_name: henta.vare.name,
          last_varefil_mtime: henta.vare.mtime,
          last_rabattfil_name: henta.rabatt?.name ?? null,
          last_rabattfil_mtime: henta.rabatt?.mtime ?? null,
        })
        .eq("supplier_id", jobb.supplier_id);
    }
    await settStatus({ status: "ferdig", finished_at: naa, result: resultat, progress_done: resultat.linjer, progress_total: resultat.linjer });
    return (await hent(admin, jobb.id))!;
  } catch (err) {
    const melding = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    const naa = new Date().toISOString();
    await settStatus({ status: "feil", finished_at: naa, error: melding });
    await admin
      .from("suppliers")
      .update({ last_import_at: naa, last_import_status: "feil", last_import_note: melding })
      .eq("id", jobb.supplier_id);
    if (jobb.source === "ftp" || jobb.source === "nattjobb") {
      await admin
        .from("supplier_ftp")
        .update({ last_fetch_at: start, last_fetch_status: "feil", last_fetch_note: melding })
        .eq("supplier_id", jobb.supplier_id);
    }
    return (await hent(admin, jobb.id))!;
  }
}

/** Lever det en jobb for grossisten? Da avvises en ny. */
export async function paagaaandeJobb(admin: SupabaseClient, supplierId: string): Promise<ImportJob | null> {
  const { data } = await admin
    .from("import_jobs")
    .select("*")
    .eq("supplier_id", supplierId)
    .in("status", ["koe", "hentar", "importerer"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ImportJob | null) ?? null;
}

/**
 * Starter jobben i bakgrunnen uten å vente — samme grep som genereringen i
 * bakgrunnen: prosessen lever lenge (Docker på Railway), så et løfte som
 * ikke awaites fullfører likevel. Feil ender på jobben, ikke i loggen alene.
 */
export function startIBakgrunnen(admin: SupabaseClient, jobId: string): void {
  void koeyrImportJobb(admin, jobId).catch((err) => {
    console.error(`importjobb ${jobId} krasjet:`, err instanceof Error ? err.message : err);
  });
}

async function hent(admin: SupabaseClient, id: string): Promise<ImportJob | null> {
  const { data } = await admin.from("import_jobs").select("*").eq("id", id).maybeSingle();
  return (data as ImportJob | null) ?? null;
}

async function lesFraStorage(admin: SupabaseClient, sti: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(BUCKET).download(sti);
  if (error || !data) throw new Error(`Kunne ikke lese ${sti.split("/").pop()} fra lagringen: ${error?.message ?? "ukjent feil"}`);
  return Buffer.from(await data.arrayBuffer());
}

function sammeTid(a: string | null, b: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return Math.abs(Date.parse(a) - Date.parse(b)) < 1000;
}
