import type { SupabaseClient } from "@supabase/supabase-js";
import { hentFiler, listFiler, matcharMonster, type FjernFil, type FtpOppsett } from "@/lib/grossist/ftp";
import type { InvoiceMatchStatus, SupplierInvoice, SupplierInvoiceFile } from "@/lib/types";
import { finnAdapter, foersteLinje, referansarFraDokument, type FakturaDokument } from "./faktura-dokument";
import { BUCKET, behandleFaktura, finnDuplikat } from "./sync";

/**
 * Fakturafiler fra grossistens FTP («autofakt»).
 *
 * Grossisten legger én fil per faktura (eller bunt) på samme FTP-område som
 * prisfilene. Vi lister, henter alle nye som matcher mønsteret, legger dem
 * i Storage slik de kom, leser dem med riktig adapter og skriver fakturaer
 * og linjer. Derfra er alt felles med PowerOffice-løypa: behandleFaktura()
 * matcher mot ordrer og lager materiell.
 *
 * Idempotent på to nivå: samme fil (navn + mtime) hoppes over, og samme
 * faktura (grossist + fakturanummer) fra en annen fil hoppes over.
 * Én feil fil eller faktura stopper ikke resten.
 *
 * Passordet går inn i FTP-klienten og ingen andre steder. Filinnhold
 * logges aldri — bare navn, størrelse og resultat.
 */

export interface FtpFakturaResultat {
  filer: number;
  nye: number;
  fakturaer: number;
  kopla: number;
  delvis: number;
  ukopla: number;
  /** Fakturaer vi alt hadde (samme nummer fra en annen fil eller kilde). */
  duplikat: number;
  feil: string[];
}

/** FTP-funksjonene kan byttes ut i test — samme signaturer som ftp.ts. */
export interface FtpFakturaDeps {
  list: (o: FtpOppsett) => Promise<FjernFil[]>;
  hent: (o: FtpOppsett, names: string[]) => Promise<Map<string, Buffer>>;
}

interface FtpRad extends FtpOppsett {
  supplier_id: string;
  company_id: string;
  fakturafil_pattern: string | null;
  fakturafil_path: string | null;
}

/** Henter og leser nye fakturafiler for én grossist. Kalles fra knapp og nattjobb. */
export async function hentFakturafiler(
  admin: SupabaseClient,
  supplierId: string,
  opts: { trigger: "manuell" | "nattjobb"; deps?: FtpFakturaDeps },
): Promise<FtpFakturaResultat> {
  const deps: FtpFakturaDeps = opts.deps ?? { list: listFiler, hent: hentFiler };
  const resultat: FtpFakturaResultat = { filer: 0, nye: 0, fakturaer: 0, kopla: 0, delvis: 0, ukopla: 0, duplikat: 0, feil: [] };

  const { data: rad } = await admin.from("supplier_ftp").select("*").eq("supplier_id", supplierId).maybeSingle();
  if (!rad) throw new Error("Grossisten har ikke noe FTP-oppsett.");
  const ftp = rad as FtpRad;
  const monster = ftp.fakturafil_pattern?.trim() ?? "";
  if (!monster) return resultat;

  const { data: grossist } = await admin.from("suppliers").select("id, name").eq("id", supplierId).maybeSingle();
  if (!grossist) throw new Error("Fant ikke grossisten.");

  const oppsett: FtpOppsett = { ...ftp, remote_path: ftp.fakturafil_path?.trim() || ftp.remote_path };
  const start = new Date().toISOString();

  try {
    // 1–2. List, filtrer på mønsteret. Alle treff, ikke bare nyeste.
    const alle = await deps.list(oppsett);
    const treff = alle.filter((f) => matcharMonster(f.name, monster));
    resultat.filer = treff.length;

    // 3. Kjente filer (navn + mtime) hoppes over.
    const { data: kjende } = await admin
      .from("supplier_invoice_files")
      .select("file_name, file_mtime")
      .eq("supplier_id", supplierId);
    const kjendSet = new Set((kjende ?? []).map((k) => noekkel(k.file_name as string, k.file_mtime as string | null)));
    const nye = treff
      .filter((f) => !kjendSet.has(noekkel(f.name, f.mtime)))
      .sort((a, b) => (Date.parse(a.mtime ?? "") || 0) - (Date.parse(b.mtime ?? "") || 0) || a.name.localeCompare(b.name));
    resultat.nye = nye.length;

    if (nye.length) {
      // 4. Last ned i én økt, eldst først, og legg hver fil i Storage.
      const innhald = await deps.hent(oppsett, nye.map((f) => f.name));
      for (const fil of nye) {
        const bytes = innhald.get(fil.name);
        if (!bytes) {
          resultat.feil.push(`${fil.name}: fikk ikke lastet ned.`);
          continue;
        }
        try {
          await behandleFil(admin, { ftp, grossist, fil, bytes, start }, resultat);
        } catch (err) {
          resultat.feil.push(`${fil.name}: ${melding(err)}`);
        }
      }
    }

    const status = resultat.feil.length ? "feil" : resultat.nye === 0 ? "ingen_ny_fil" : "ok";
    await admin
      .from("supplier_ftp")
      .update({
        last_invoice_fetch_at: start,
        last_invoice_fetch_status: status,
        last_invoice_fetch_note: notat(resultat),
      })
      .eq("supplier_id", supplierId);
  } catch (err) {
    const m = melding(err);
    resultat.feil.unshift(m);
    await admin
      .from("supplier_ftp")
      .update({ last_invoice_fetch_at: start, last_invoice_fetch_status: "feil", last_invoice_fetch_note: `Feilet: ${m.slice(0, 200)}` })
      .eq("supplier_id", supplierId);
  }
  return resultat;
}

export function notat(r: FtpFakturaResultat): string {
  if (r.nye === 0 && r.feil.length === 0) return `Ingen ny fil (${r.filer} på serveren).`;
  const deler = [
    `${r.nye} nye filer`,
    `${r.fakturaer} fakturaer`,
    `${r.kopla} koblet`,
    ...(r.delvis ? [`${r.delvis} delvis`] : []),
    `${r.ukopla} ukoblet`,
    ...(r.duplikat ? [`${r.duplikat} duplikat`] : []),
    ...(r.feil.length ? [`${r.feil.length} feil`] : []),
  ];
  return deler.join(", ");
}

// ---------------------------------------------------------------------------
// Én fil
// ---------------------------------------------------------------------------

async function behandleFil(
  admin: SupabaseClient,
  inn: { ftp: FtpRad; grossist: { id: string; name: string }; fil: FjernFil; bytes: Buffer; start: string },
  resultat: FtpFakturaResultat,
): Promise<void> {
  const { ftp, grossist, fil, bytes } = inn;
  const filnamn = fil.name.replace(/[/\\]/g, "_");
  const sti = `${ftp.company_id}/ftp/${grossist.id}/${filnamn}`;

  const { error: lagreFeil } = await admin.storage
    .from(BUCKET)
    .upload(sti, bytes, { contentType: "application/octet-stream", upsert: true });
  if (lagreFeil) throw new Error(`Kunne ikke lagre fila: ${lagreFeil.message}`);

  const { data: filRad, error: filFeil } = await admin
    .from("supplier_invoice_files")
    .insert({
      company_id: ftp.company_id,
      supplier_id: grossist.id,
      file_name: fil.name,
      file_mtime: fil.mtime,
      file_size: fil.size,
      storage_path: sti,
      status: "henta",
    })
    .select("*")
    .single();
  if (filFeil || !filRad) throw new Error(`Kunne ikke registrere fila: ${filFeil?.message ?? "ukjent feil"}`);
  const filId = (filRad as SupplierInvoiceFile).id;

  const settFil = async (felt: Record<string, unknown>) => {
    await admin.from("supplier_invoice_files").update(felt).eq("id", filId);
  };

  // 5. Format.
  const adapter = finnAdapter(bytes, fil.name);
  if (!adapter) {
    const m = `Kjenner ikke igjen formatet. Første linje: ${foersteLinje(bytes)}`;
    await settFil({ status: "feil", error: m });
    resultat.feil.push(`${fil.name}: ${m}`);
    return;
  }
  await settFil({ format: adapter.key });

  let dokument: FakturaDokument[];
  try {
    dokument = adapter.parse(bytes);
  } catch (err) {
    const m = melding(err);
    await settFil({ status: "feil", error: m });
    resultat.feil.push(`${fil.name}: ${m}`);
    return;
  }

  // 6–7. Én faktura om gangen. Feil på én stopper ikke resten.
  let nye = 0;
  let duplikat = 0;
  const feilFoer = resultat.feil.length;
  for (const dok of dokument) {
    try {
      const utfall = await skrivFaktura(admin, ftp, grossist, filId, sti, dok);
      if (utfall === "duplikat") {
        duplikat += 1;
        resultat.duplikat += 1;
      } else {
        nye += 1;
        resultat.fakturaer += 1;
        if (utfall === "kopla") resultat.kopla += 1;
        else if (utfall === "delvis") resultat.delvis += 1;
        else if (utfall === "ukopla") resultat.ukopla += 1;
      }
    } catch (err) {
      resultat.feil.push(`${fil.name}, faktura ${dok.invoiceNo ?? "(uten nummer)"}: ${melding(err)}`);
    }
  }

  // 8. Fila er lest.
  const feilIFila = resultat.feil.length - feilFoer;
  await settFil({
    status: feilIFila && nye === 0 ? "feil" : nye === 0 && duplikat > 0 ? "duplikat" : "lest",
    invoice_count: nye,
    parsed_at: new Date().toISOString(),
    error: feilIFila ? resultat.feil.slice(feilFoer).join(" | ").slice(0, 500) : null,
  });
}

/**
 * Én faktura fra dokumentet: hopp over om vi har den, ellers hode + linjer +
 * matching. Returnerer statusen fakturaen fikk, eller «duplikat».
 */
async function skrivFaktura(
  admin: SupabaseClient,
  ftp: FtpRad,
  grossist: { id: string; name: string },
  filId: string,
  sti: string,
  dok: FakturaDokument,
): Promise<InvoiceMatchStatus | "duplikat"> {
  const invoiceNo = dok.invoiceNo?.trim();
  if (!invoiceNo) throw new Error("Fakturaen mangler fakturanummer.");

  // Samme faktura fra en annen fil?
  const { data: finst } = await admin
    .from("supplier_invoices")
    .select("id")
    .eq("company_id", ftp.company_id)
    .eq("supplier_id", grossist.id)
    .eq("invoice_no", invoiceNo)
    .eq("source", "ftp")
    .limit(1);
  if ((finst ?? []).length) return "duplikat";

  // Samme faktura alt hentet fra regnskapssystemet? Da er den originalen.
  const original = dok.supplierOrgNr
    ? await finnDuplikat(admin, ftp.company_id, dok.supplierOrgNr, invoiceNo, "regnskap", null)
    : null;

  const erKreditnota = dok.type === "kreditnota";
  const { data: rad, error } = await admin
    .from("supplier_invoices")
    .insert({
      company_id: ftp.company_id,
      source: "ftp",
      supplier_id: grossist.id,
      file_id: filId,
      external_id: `ftp:${invoiceNo}`,
      voucher_type: erKreditnota ? "IncomingCreditNote" : "IncomingInvoice",
      invoice_no: invoiceNo,
      voucher_date: dok.issueDate,
      due_date: dok.dueDate,
      supplier_name: grossist.name,
      supplier_org_nr: dok.supplierOrgNr,
      currency: dok.currency,
      net_amount: dok.taxExclusiveAmount,
      total_amount: dok.payableAmount,
      references_found: referansarFraDokument(dok),
      has_ehf: true,
      ehf_storage_path: sti,
      duplicate_of: original,
      match_status: original ? "ignorert" : "ukopla",
      fetched_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !rad) throw new Error(`Kunne ikke lagre fakturaen: ${error?.message ?? "ukjent feil"}`);
  const faktura = rad as SupplierInvoice;

  if (original) {
    await admin
      .from("supplier_invoices")
      .update({ ehf_parsed_at: new Date().toISOString(), line_count: 0 })
      .eq("id", faktura.id);
    return "duplikat";
  }

  const { status } = await behandleFaktura(admin, faktura, dok);
  return status;
}

function noekkel(name: string, mtime: string | null): string {
  const t = mtime ? Date.parse(mtime) : NaN;
  return `${name}\u0000${Number.isFinite(t) ? Math.round(t / 1000) : ""}`;
}

function melding(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
