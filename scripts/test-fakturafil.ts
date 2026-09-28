/**
 * Fakturafiler fra grossisten — adaptere, henting og duplikater. Uten
 * database og uten nettverk.
 *
 *   npm run test:fakturafil
 *
 * 1. Går gjennom prover/* (gitignored — ekte fakturaer er kundedata),
 *    finner adapter, parser, og skriver ut per fil: format, antall
 *    fakturaer, og per faktura nummer, dato, org.nr, referanser, linjer og
 *    sum av linjene mot totalen (avvik = rødt).
 * 2. Kjører hele hentFakturafiler-løypa mot en Supabase-stubb i minnet med
 *    listFiler/hentFiler byttet ut: idempotens (samme fil to ganger → nye 0),
 *    samme faktura fra to filer, duplikat på tvers av kilder, ukjent format,
 *    og NELFO-stubben som feiler tydelig.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IKKJE_STOETTA } from "@/lib/regnskap/adapter-nelfo4";
import { finnAdapter, referansarFraDokument } from "@/lib/regnskap/faktura-dokument";
import { hentFakturafiler, notat } from "@/lib/regnskap/ftp-faktura";
import { finnDuplikat, matchAlle } from "@/lib/regnskap/sync";

let feil = 0;
function sjekk(navn: string, ok: boolean, detalj?: string) {
  console.log(`${ok ? "✓" : "✗"} ${navn}${!ok && detalj ? ` — ${detalj}` : ""}`);
  if (!ok) feil += 1;
}

// ---------------------------------------------------------------------------
// 1. Prøvefiler
// ---------------------------------------------------------------------------
const PROVER = join(process.cwd(), "prover");
let proveFiler: string[] = [];
try {
  proveFiler = readdirSync(PROVER).filter((f) => !f.startsWith(".") && f !== "README.md" && statSync(join(PROVER, f)).isFile());
} catch {
  proveFiler = [];
}
if (proveFiler.length === 0) {
  console.log("prover/: ingen filer — legg ekte fakturafiler der for å prøve adapterne mot dem.\n");
}
for (const namn of proveFiler) {
  const bytes = readFileSync(join(PROVER, namn));
  const adapter = finnAdapter(bytes, namn);
  if (!adapter) {
    console.log(`⚠ ${namn}: kjenner ikke igjen formatet`);
    continue;
  }
  try {
    const dokument = adapter.parse(bytes);
    console.log(`${namn}: ${adapter.key}, ${dokument.length} ${dokument.length === 1 ? "faktura" : "fakturaer"}`);
    for (const d of dokument) {
      const sum = Math.round(d.lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
      const total = d.taxExclusiveAmount;
      const avvik = total !== null && Math.abs(sum - total) > 0.01;
      console.log(
        `  ${d.type} ${d.invoiceNo ?? "(uten nr)"} · ${d.issueDate ?? "?"} · org ${d.supplierOrgNr ?? "?"} · ref [${referansarFraDokument(d).join(", ")}] · ${d.lines.length} linjer · sum ${sum} vs total ${total ?? "?"}${avvik ? "  \x1b[31mAVVIK\x1b[0m" : ""}`,
      );
      if (avvik) feil += 1;
    }
  } catch (err) {
    console.log(`⚠ ${namn}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Supabase-stubb i minnet — akkurat nok av PostgREST-bygeren til løypa.
// ---------------------------------------------------------------------------
type Rad = Record<string, unknown>;
const tabellar = new Map<string, Rad[]>();
const lagring = new Map<string, number>();
let idTeljar = 0;
const nyId = () => `00000000-0000-4000-8000-${String(++idTeljar).padStart(12, "0")}`;

const STANDARD: Record<string, Rad> = {
  supplier_invoices: { references_found: [], has_ehf: false, match_status: "ukopla", line_count: 0, matched_line_count: 0, order_id: null, duplicate_of: null, supplier_name: null, supplier_org_nr: null, invoice_no: null, parse_error: null, ehf_parsed_at: null, raw: null, voucher_no: null, connection_id: null, provider: null },
  supplier_invoice_lines: { status: "ukopla", order_id: null, material_entry_id: null },
  supplier_invoice_files: { status: "henta", invoice_count: 0, error: null, format: null, parsed_at: null },
  material_entries: { replaced_by: null },
};

function tabell(namn: string): Rad[] {
  let t = tabellar.get(namn);
  if (!t) {
    t = [];
    tabellar.set(namn, t);
  }
  return t;
}

type Filter = (r: Rad) => boolean;

class Byggar {
  private filtre: Filter[] = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private nytt: Rad[] = [];
  private oppdatering: Rad = {};
  private tel = false;
  private berreTel = false;
  private sortering: { col: string; asc: boolean }[] = [];
  private grense: number | null = null;
  private namn: string;
  constructor(namn: string) {
    this.namn = namn;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.tel = Boolean(opts?.count);
      this.berreTel = Boolean(opts?.head);
    }
    return this;
  }
  insert(rader: Rad | Rad[]) {
    this.op = "insert";
    this.nytt = (Array.isArray(rader) ? rader : [rader]).map((r) => ({ id: nyId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(STANDARD[this.namn] ?? {}), ...r }));
    return this;
  }
  update(felt: Rad, _opts?: unknown) {
    this.op = "update";
    this.oppdatering = felt;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) { this.filtre.push((r) => r[col] === v); return this; }
  neq(col: string, v: unknown) { this.filtre.push((r) => r[col] !== v); return this; }
  in(col: string, vs: unknown[]) { this.filtre.push((r) => vs.includes(r[col])); return this; }
  is(col: string, v: unknown) { this.filtre.push((r) => (v === null ? r[col] === null || r[col] === undefined : r[col] === v)); return this; }
  not(col: string, op: string, v: unknown) {
    if (op === "is" && v === null) this.filtre.push((r) => r[col] !== null && r[col] !== undefined);
    return this;
  }
  lt(col: string, v: string) { this.filtre.push((r) => String(r[col]) < v); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.sortering.push({ col, asc: opts?.ascending !== false }); return this; }
  limit(n: number) { this.grense = n; return this; }

  private koyr(): { data: Rad[] | null; error: null; count: number | null } {
    const t = tabell(this.namn);
    const treff = () => t.filter((r) => this.filtre.every((f) => f(r)));
    if (this.op === "insert") {
      t.push(...this.nytt);
      return { data: this.nytt, error: null, count: null };
    }
    if (this.op === "update") {
      const rader = treff();
      for (const r of rader) Object.assign(r, this.oppdatering, { updated_at: new Date().toISOString() });
      return { data: rader, error: null, count: rader.length };
    }
    if (this.op === "delete") {
      const rader = treff();
      for (const r of rader) t.splice(t.indexOf(r), 1);
      return { data: rader, error: null, count: rader.length };
    }
    let rader = treff();
    for (const s of [...this.sortering].reverse()) {
      rader = [...rader].sort((a, b) => (String(a[s.col] ?? "") < String(b[s.col] ?? "") ? -1 : 1) * (s.asc ? 1 : -1));
    }
    if (this.grense !== null) rader = rader.slice(0, this.grense);
    return { data: this.berreTel ? null : rader.map((r) => ({ ...r })), error: null, count: this.tel ? rader.length : null };
  }
  then<T>(res: (v: { data: Rad[] | null; error: null; count: number | null }) => T) { return Promise.resolve(this.koyr()).then(res); }
  async single() { const r = this.koyr(); return { data: r.data?.[0] ?? null, error: r.data?.[0] ? null : { message: "ingen rad" } }; }
  async maybeSingle() { const r = this.koyr(); return { data: r.data?.[0] ?? null, error: null }; }
}

const admin = {
  from: (namn: string) => new Byggar(namn),
  storage: {
    from: (_bucket: string) => ({
      upload: async (sti: string, bytes: Buffer) => { lagring.set(sti, bytes.length); return { data: { path: sti }, error: null }; },
    }),
  },
} as unknown as SupabaseClient;

// Utgangspunkt: ett selskap, én grossist med FTP og fakturamønster, én ordre.
const COMPANY = "c0000000-0000-4000-8000-000000000001";
const SUPPLIER = "50000000-0000-4000-8000-000000000001";
const ORDRE_1042 = "a0000000-0000-4000-8000-000000001042";
tabell("companies").push({ id: COMPANY, materials_markup_pct: 20 });
tabell("suppliers").push({ id: SUPPLIER, company_id: COMPANY, name: "Onninen" });
tabell("supplier_ftp").push({ supplier_id: SUPPLIER, company_id: COMPANY, protocol: "ftp", host: "ftp.example", port: null, username: "u", password: "hemmeleg", remote_path: "/", fakturafil_pattern: "F4*", fakturafil_path: null });
tabell("orders").push({ id: ORDRE_1042, company_id: COMPANY, order_no: 1042, status: "paagaar" });
tabell("supplier_items").push({ id: "i1", company_id: COMPANY, supplier_id: SUPPLIER, item_no: "1234567", active: true });

function ehf(invoiceNo: string, orgNr = "987654321"): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${invoiceNo}</cbc:ID>
  <cbc:IssueDate>2026-09-20</cbc:IssueDate>
  <cbc:DueDate>2026-10-20</cbc:DueDate>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>Ordre 1042</cbc:BuyerReference>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyLegalEntity><cbc:RegistrationName>ONNINEN AS</cbc:RegistrationName><cbc:CompanyID>${orgNr}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="NOK">450.00</cbc:TaxExclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">562.50</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">250.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Stikkontakt dobbel</cbc:Name><cac:SellersItemIdentification><cbc:ID>1234567</cbc:ID></cac:SellersItemIdentification></cac:Item>
  </cac:InvoiceLine>
  <cac:InvoiceLine>
    <cbc:ID>2</cbc:ID>
    <cbc:InvoicedQuantity unitCode="MTR">50</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">200.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Kabel PFXP 3G1,5</cbc:Name></cac:Item>
  </cac:InvoiceLine>
</Invoice>`, "utf-8");
}

const server = new Map<string, { mtime: string; bytes: Buffer }>();
const deps = {
  list: async () => [...server.entries()].map(([name, f]) => ({ name, size: f.bytes.length, mtime: f.mtime })),
  hent: async (_o: unknown, names: string[]) => new Map(names.map((n) => [n, server.get(n)!.bytes])),
};
const hent = () => hentFakturafiler(admin, SUPPLIER, { trigger: "manuell", deps });

// Adaptere ------------------------------------------------------------------
sjekk("finnAdapter: EHF-XML → ehf", finnAdapter(ehf("1"), "x.xml")?.key === "ehf");
sjekk("finnAdapter: EHF uten xml-prolog → ehf", finnAdapter(Buffer.from("  <Invoice xmlns=\"x\"></Invoice>"), "x")?.key === "ehf");
sjekk("finnAdapter: postkode-layout → nelfo4 (stubb)", finnAdapter(Buffer.from("FH;EFONELFO;4.0;NO979692900MVA\r\nFL;1;..."), "F4123.txt")?.key === "nelfo4");
sjekk("finnAdapter: PDF/annet → null", finnAdapter(Buffer.from("%PDF-1.4 ..."), "x.pdf") === null);
try {
  finnAdapter(Buffer.from("FH;EFONELFO;4.0"), "f")!.parse(Buffer.from("FH;EFONELFO;4.0"));
  sjekk("nelfo4-stubb kaster «ikke støttet ennå»", false);
} catch (err) {
  sjekk("nelfo4-stubb kaster «ikke støttet ennå»", (err as Error).message === IKKJE_STOETTA);
}

// Første henting -------------------------------------------------------------
server.set("F4-1001.xml", { mtime: "2026-09-20T06:00:00Z", bytes: ehf("1001") });
server.set("V4priser.all", { mtime: "2026-09-20T03:00:00Z", bytes: Buffer.from("VH;EFONELFO;4.0") });
const r1 = await hent();
sjekk("1. henting: 1 fil matcher F4*, 1 ny, 1 faktura", r1.filer === 1 && r1.nye === 1 && r1.fakturaer === 1, JSON.stringify(r1));
sjekk("1. henting: fakturaen koblet til ordre 1042 via BuyerReference", r1.kopla === 1 && r1.ukopla === 0, JSON.stringify(r1));
sjekk("1. henting: ingen feil", r1.feil.length === 0, r1.feil.join("; "));
const fakturaer = () => tabell("supplier_invoices");
const f1 = fakturaer()[0];
sjekk("fakturaen har source ftp, supplier_id, file_id, external_id ftp:1001", f1?.source === "ftp" && f1?.supplier_id === SUPPLIER && Boolean(f1?.file_id) && f1?.external_id === "ftp:1001");
sjekk("leverandørnavn fra grossisten, org.nr fra dokumentet", f1?.supplier_name === "Onninen" && f1?.supplier_org_nr === "987654321");
sjekk("hodet: beløp, dato, referanser", f1?.net_amount === 450 && f1?.total_amount === 562.5 && f1?.voucher_date === "2026-09-20" && (f1?.references_found as string[]).includes("Ordre 1042"));
sjekk("status koblet, 2 linjer, ordre satt", f1?.match_status === "kopla" && f1?.line_count === 2 && f1?.matched_line_count === 2 && f1?.order_id === ORDRE_1042);
const materiell = tabell("material_entries");
sjekk("2 materiell-linjer på ordren med source faktura og påslag 20", materiell.length === 2 && materiell.every((m) => m.order_id === ORDRE_1042 && m.source === "faktura" && m.markup_pct === 20));
sjekk("kabel: 50 m à 4 kr", materiell.some((m) => m.unit === "m" && m.quantity === 50 && m.cost_price === 4 && m.sale_price === 4.8));
sjekk("elnummer koblet til katalogvaren", materiell.some((m) => m.item_no === "1234567" && m.supplier_item_id === "i1"));
const fil1 = tabell("supplier_invoice_files")[0];
sjekk("fila: lest, format ehf, 1 faktura, i Storage under {company}/ftp/{supplier}/", fil1?.status === "lest" && fil1?.format === "ehf" && fil1?.invoice_count === 1 && lagring.has(`${COMPANY}/ftp/${SUPPLIER}/F4-1001.xml`));
const ftp1 = tabell("supplier_ftp")[0];
sjekk("supplier_ftp: last_invoice_fetch ok med notat", ftp1?.last_invoice_fetch_status === "ok" && String(ftp1?.last_invoice_fetch_note).startsWith("1 nye filer, 1 fakturaer, 1 koblet"), String(ftp1?.last_invoice_fetch_note));

// Idempotens -----------------------------------------------------------------
const r2 = await hent();
sjekk("2. henting, samme fillista: nye 0, ingen ny faktura, ingen nytt materiell", r2.nye === 0 && r2.fakturaer === 0 && fakturaer().length === 1 && materiell.length === 2, JSON.stringify(r2));
sjekk("2. henting: status ingen_ny_fil", tabell("supplier_ftp")[0]?.last_invoice_fetch_status === "ingen_ny_fil");

// Samme faktura fra en ny fil ------------------------------------------------
server.set("F4-1001-igjen.xml", { mtime: "2026-09-21T06:00:00Z", bytes: ehf("1001") });
const r3 = await hent();
sjekk("samme fakturanummer i ny fil: 1 ny fil, 0 fakturaer, 1 duplikat", r3.nye === 1 && r3.fakturaer === 0 && r3.duplikat === 1 && fakturaer().length === 1, JSON.stringify(r3));
sjekk("fila står som duplikat", tabell("supplier_invoice_files").find((f) => f.file_name === "F4-1001-igjen.xml")?.status === "duplikat");

// Duplikat på tvers av kilder ---------------------------------------------------
// a) Fakturaen finnes alt fra regnskapssystemet → FTP-kopien blir duplikat, ingen linjer.
tabell("supplier_invoices").push({ id: "pogo-2002", company_id: COMPANY, source: "regnskap", connection_id: "k1", provider: "poweroffice", external_id: "uuid-2002", voucher_type: "IncomingInvoice", invoice_no: "2002", supplier_org_nr: "987654321", references_found: [], match_status: "kopla", line_count: 2, matched_line_count: 2, order_id: ORDRE_1042, duplicate_of: null, fetched_at: "2026-09-19T00:00:00Z", has_ehf: true });
server.set("F4-2002.xml", { mtime: "2026-09-22T06:00:00Z", bytes: ehf("2002") });
const materiellFoer = materiell.length;
const r4 = await hent();
const ftpKopi = fakturaer().find((f) => f.source === "ftp" && f.invoice_no === "2002");
sjekk("faktura som alt finnes fra POGO: telles som duplikat, ikke som ny", r4.duplikat === 1 && r4.fakturaer === 0, JSON.stringify(r4));
sjekk("FTP-kopien peker på POGO-originalen og er ignorert", ftpKopi?.duplicate_of === "pogo-2002" && ftpKopi?.match_status === "ignorert");
sjekk("ingen linjer og intet materiell fra duplikatet", tabell("supplier_invoice_lines").filter((l) => l.invoice_id === ftpKopi?.id).length === 0 && materiell.length === materiellFoer);

// b) Motsatt vei: POGO-synken slår opp FTP-originalen med finnDuplikat.
const original = await finnDuplikat(admin, COMPANY, "987654321", "1001", "ftp", null);
sjekk("finnDuplikat finner FTP-originalen for POGO-synken", original === f1?.id);
sjekk("finnDuplikat: ukjent nummer → null", (await finnDuplikat(admin, COMPANY, "987654321", "9999", "ftp", null)) === null);
sjekk("finnDuplikat: ser bort fra rader som selv er duplikat", (await finnDuplikat(admin, COMPANY, "987654321", "2002", "ftp", null)) === null);

// c) matchAlle hopper over duplikater — selv med linjer i ukoblet stand.
tabell("supplier_invoice_lines").push({ id: "l-dup", company_id: COMPANY, invoice_id: ftpKopi?.id, line_no: "1", item_no: null, name: "x", quantity: 1, unit: "stk", unit_price: 10, line_total: 10, order_reference: "1042", status: "ukopla", order_id: null, material_entry_id: null });
await matchAlle(admin, COMPANY, [String(ftpKopi?.id)]);
sjekk("matchAlle lager ikke materiell for et duplikat", materiell.length === materiellFoer);

// Feil som skal være synlige ----------------------------------------------------
server.set("F4-3003.txt", { mtime: "2026-09-23T06:00:00Z", bytes: Buffer.from("FH;EFONELFO;4.0;NO979692900MVA;;42827\r\nFL;1;3003\r\n", "latin1") });
server.set("F4-notat.pdf", { mtime: "2026-09-23T06:01:00Z", bytes: Buffer.from("%PDF-1.4 binær") });
const r5 = await hent();
const nelfoFil = tabell("supplier_invoice_files").find((f) => f.file_name === "F4-3003.txt");
const pdfFil = tabell("supplier_invoice_files").find((f) => f.file_name === "F4-notat.pdf");
sjekk("NELFO-fil: står som feil med «ikke støttet ennå», format nelfo4", nelfoFil?.status === "feil" && nelfoFil?.error === IKKJE_STOETTA && nelfoFil?.format === "nelfo4", String(nelfoFil?.error));
sjekk("ukjent format: står som feil med første linje sitert", pdfFil?.status === "feil" && String(pdfFil?.error).startsWith("Kjenner ikke igjen formatet. Første linje: %PDF"), String(pdfFil?.error));
sjekk("resultatet har begge feilene, og supplier_ftp sier feil", r5.feil.length === 2 && tabell("supplier_ftp")[0]?.last_invoice_fetch_status === "feil", JSON.stringify(r5.feil));
sjekk("feilmeldinger inneholder aldri passordet", !JSON.stringify(r5).includes("hemmeleg") && !JSON.stringify(tabell("supplier_invoice_files")).includes("hemmeleg"));
const r6 = await hent();
sjekk("feilede filer hentes ikke på nytt (navn + mtime er kjent)", r6.nye === 0 && r6.feil.length === 0, JSON.stringify(r6));

// Mønster av → ingen tilkobling ------------------------------------------------
tabell("supplier_ftp")[0].fakturafil_pattern = null;
let lista = false;
const r7 = await hentFakturafiler(admin, SUPPLIER, { trigger: "nattjobb", deps: { list: async () => { lista = true; return []; }, hent: deps.hent } });
sjekk("tomt mønster: returnerer 0 uten å koble til", r7.filer === 0 && !lista);

// notat ----------------------------------------------------------------------------
sjekk("notat: ingen ny fil", notat({ filer: 3, nye: 0, fakturaer: 0, kopla: 0, delvis: 0, ukopla: 0, duplikat: 0, feil: [] }) === "Ingen ny fil (3 på serveren).");
sjekk("notat: full linje", notat({ filer: 3, nye: 3, fakturaer: 3, kopla: 2, delvis: 0, ukopla: 1, duplikat: 0, feil: [] }) === "3 nye filer, 3 fakturaer, 2 koblet, 1 ukoblet");

console.log(feil === 0 ? "\nAlt i orden." : `\n${feil} feil.`);
process.exit(feil === 0 ? 0 : 1);
