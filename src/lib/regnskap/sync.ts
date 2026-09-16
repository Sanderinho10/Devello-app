import type { SupabaseClient } from "@supabase/supabase-js";
import { salspris } from "@/lib/ordre/summering";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  AccountingProvider,
  InvoiceMatchStatus,
  Order,
  SupplierInvoice,
  SupplierInvoiceLine,
} from "@/lib/types";
import { parseEhf, type EhfFaktura } from "./ehf";
import { finnOrdrenummer } from "./matching";
import { pogoClient, type PogoInngaaandeFaktura, type PogoKopling } from "./poweroffice";

/**
 * Henter leverandørfakturaer fra regnskapssystemet og legger linjene på
 * ordren.
 *
 * Kjøres fra «Hent fakturaer»-knappen nå, og fra en cron senere — derfor
 * tar den companyId og ikke en sesjon. Idempotent: fakturaer er unike på
 * (company, provider, external_id), linjer skrives bare første gang de
 * parses, og materiell lages bare for linjer som ikke har det fra før.
 *
 * Rekkefølgen er valgt så en feil midt i aldri koster oss det som alt er
 * hentet: hodene lagres først, så dokumentasjon og linjer per faktura, så
 * matching. Feiler én faktura, går vi videre til neste og noterer feilen.
 */

export const BUCKET = "supplier-invoices";

export interface SyncResultat {
  ikkeTilkoblet?: boolean;
  henta: number;
  nye: number;
  kopla: number;
  delvis: number;
  ukopla: number;
  feil: string[];
}

interface Kopling {
  id: string;
  company_id: string;
  provider: AccountingProvider;
  environment: "production" | "demo";
  client_key: string;
  sync_cursor: string | null;
}

export async function synkroniserFakturaer(
  companyId: string,
  _opts: { trigger: "manuell" | "cron" } = { trigger: "manuell" },
): Promise<SyncResultat> {
  const admin = supabaseAdmin();
  const resultat: SyncResultat = { henta: 0, nye: 0, kopla: 0, delvis: 0, ukopla: 0, feil: [] };

  const { data: rad } = await admin
    .from("accounting_connections")
    .select("id, company_id, provider, environment, client_key, sync_cursor")
    .eq("company_id", companyId)
    .neq("status", "kopla_fra")
    .maybeSingle();
  if (!rad) return { ...resultat, ikkeTilkoblet: true };
  const kopling = rad as Kopling;

  if (kopling.provider !== "poweroffice") {
    return { ...resultat, feil: [`${kopling.provider} er ikke støttet ennå.`] };
  }

  const start = new Date();
  let nyCursor: string | null = kopling.sync_cursor;

  try {
    const pogo = pogoClient(kopling as PogoKopling);

    // Vindu: én uke bakover fra vannmerket, så en faktura som ble endret
    // sent i Go likevel blir fanget. Første gang: 60 dager.
    const fra = kopling.sync_cursor
      ? new Date(new Date(kopling.sync_cursor).getTime() - 7 * 86_400_000)
      : new Date(start.getTime() - 60 * 86_400_000);
    const fromDate = fra.toISOString().slice(0, 10);

    const hoder: PogoInngaaandeFaktura[] = [];
    for (let side = 1; side <= 50; side++) {
      const del = await pogo.hentInngaaandeFakturaer({ fromDate, pageNumber: side, pageSize: 100 });
      hoder.push(...del);
      if (del.length < 100) break;
    }
    resultat.henta = hoder.length;

    // Hva har vi fra før? Bare for å telle nye.
    const { data: kjente } = await admin
      .from("supplier_invoices")
      .select("external_id")
      .eq("company_id", companyId)
      .eq("provider", "poweroffice")
      .in("external_id", hoder.map((h) => h.Id));
    const kjentSet = new Set((kjente ?? []).map((k) => k.external_id as string));

    // 1. Hodene. Bare hodefeltene — match_status, order_id og linjer rører
    //    vi ikke her, så et nytt kall aldri nullstiller en manuell kopling.
    if (hoder.length) {
      const rader = hoder.map((h) => ({
        company_id: companyId,
        connection_id: kopling.id,
        provider: "poweroffice",
        external_id: h.Id,
        voucher_no: h.VoucherNo,
        voucher_type: h.VoucherType,
        invoice_no: h.InvoiceNo,
        voucher_date: h.VoucherDate?.slice(0, 10) ?? null,
        due_date: h.DueDate?.slice(0, 10) ?? null,
        supplier_external_id: h.SupplierId,
        supplier_no: h.SupplierNo,
        currency: h.CurrencyCode,
        net_amount: h.NetAmount,
        total_amount: h.TotalAmount,
        raw: h.raw,
        fetched_at: start.toISOString(),
      }));
      const { error } = await admin
        .from("supplier_invoices")
        .upsert(rader, { onConflict: "company_id,provider,external_id" });
      if (error) throw new Error(`Kunne ikke lagre fakturaer: ${error.message}`);
      resultat.nye = hoder.filter((h) => !kjentSet.has(h.Id)).length;

      for (const h of hoder) {
        const t = h.LastChangedDateTimeOffset ?? h.CreatedDateTimeOffset;
        if (t && (!nyCursor || new Date(t) > new Date(nyCursor))) nyCursor = t;
      }
    }

    // 2. Leverandørnavn, dokumentasjon og linjer per faktura.
    const { data: fakturaer } = await admin
      .from("supplier_invoices")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", "poweroffice")
      .in("external_id", hoder.map((h) => h.Id));

    const leverandoerCache = new Map<string, { name: string | null; no: string | null; org: string | null }>();

    for (const faktura of (fakturaer ?? []) as SupplierInvoice[]) {
      const hode = hoder.find((h) => h.Id === faktura.external_id);
      try {
        const oppdatering: Record<string, unknown> = {};

        if (!faktura.supplier_name && faktura.supplier_external_id) {
          let lev = leverandoerCache.get(faktura.supplier_external_id);
          if (!lev) {
            try {
              const l = await pogo.hentLeverandoer(faktura.supplier_external_id);
              lev = { name: l.Name, no: l.Number, org: l.OrganizationNumber };
            } catch (err) {
              lev = { name: null, no: null, org: null };
              resultat.feil.push(`Leverandør ${faktura.supplier_external_id}: ${melding(err)}`);
            }
            leverandoerCache.set(faktura.supplier_external_id, lev);
          }
          if (lev.name) oppdatering.supplier_name = lev.name;
          if (lev.no && !faktura.supplier_no) oppdatering.supplier_no = lev.no;
          if (lev.org) oppdatering.supplier_org_nr = lev.org;
        }

        let ehf: EhfFaktura | null = null;
        if (!faktura.ehf_parsed_at && !faktura.parse_error) {
          const dok = await pogo.hentDokumentasjonsstatus(faktura.external_id);
          oppdatering.has_ehf = dok.HasEhf;
          if (dok.HasEhf) {
            const xml = await pogo.lastNedEhf(faktura.external_id);
            const sti = `${companyId}/${faktura.external_id}.xml`;
            const { error: lagreFeil } = await admin.storage
              .from(BUCKET)
              .upload(sti, Buffer.from(xml, "utf-8"), { contentType: "application/xml", upsert: true });
            if (lagreFeil) throw new Error(`Kunne ikke lagre XML: ${lagreFeil.message}`);
            oppdatering.ehf_storage_path = sti;

            try {
              ehf = parseEhf(xml);
            } catch (err) {
              oppdatering.parse_error = melding(err);
            }

            if (ehf) {
              await skrivLinjer(admin, faktura, ehf);
              oppdatering.ehf_parsed_at = new Date().toISOString();
              oppdatering.parse_error = null;
              oppdatering.line_count = ehf.lines.length;
              if (!faktura.supplier_name && !oppdatering.supplier_name && ehf.supplierName) {
                oppdatering.supplier_name = ehf.supplierName;
              }
              if (ehf.supplierOrgNr && !faktura.supplier_org_nr) oppdatering.supplier_org_nr = ehf.supplierOrgNr;
              if (!faktura.invoice_no && ehf.invoiceNo) oppdatering.invoice_no = ehf.invoiceNo;
            }
          }
        }

        oppdatering.references_found = referansar(hode, ehf, faktura.references_found);

        if (Object.keys(oppdatering).length) {
          const { error } = await admin.from("supplier_invoices").update(oppdatering).eq("id", faktura.id);
          if (error) throw new Error(error.message);
        }
      } catch (err) {
        resultat.feil.push(`Faktura ${faktura.invoice_no ?? faktura.voucher_no ?? faktura.external_id}: ${melding(err)}`);
      }
    }

    // 3. Matching og materiell.
    const tal = await matchAlle(admin, companyId, hoder.map((h) => h.Id));
    resultat.kopla = tal.kopla;
    resultat.delvis = tal.delvis;
    resultat.ukopla = tal.ukopla;

    const note = `${resultat.henta} hentet, ${resultat.nye} nye, ${tal.kopla} koblet, ${tal.delvis} delvis, ${tal.ukopla} ukoblet${
      resultat.feil.length ? `, ${resultat.feil.length} feil` : ""
    }`;
    await admin
      .from("accounting_connections")
      .update({
        status: "aktiv",
        status_reason: null,
        sync_cursor: nyCursor,
        last_sync_at: start.toISOString(),
        last_sync_note: note,
      })
      .eq("id", kopling.id);
  } catch (err) {
    const m = melding(err);
    resultat.feil.unshift(m);
    await admin
      .from("accounting_connections")
      .update({
        status: "feil",
        status_reason: m,
        last_sync_at: start.toISOString(),
        last_sync_note: `Feilet: ${m.slice(0, 200)}`,
      })
      .eq("id", kopling.id);
  }

  return resultat;
}

// ---------------------------------------------------------------------------
// Linjer
// ---------------------------------------------------------------------------

/**
 * Skriver linjene fra EHF-en. Linjer som alt er koblet til materiell står
 * urørt; resten slettes og skrives om, så en ny parse aldri gir dubletter.
 */
async function skrivLinjer(admin: SupabaseClient, faktura: SupplierInvoice, ehf: EhfFaktura) {
  await admin
    .from("supplier_invoice_lines")
    .delete()
    .eq("invoice_id", faktura.id)
    .is("material_entry_id", null);

  const { data: att } = await admin
    .from("supplier_invoice_lines")
    .select("line_no")
    .eq("invoice_id", faktura.id);
  const alleredeKopla = new Set((att ?? []).map((l) => l.line_no as string | null));

  // Elnummer → katalogvare, for sporbarhet. Kostprisen kommer fra fakturaen.
  const elnr = [...new Set(ehf.lines.map((l) => l.elnr).filter(Boolean))] as string[];
  const katalog = new Map<string, string>();
  if (elnr.length) {
    const { data: varer } = await admin
      .from("supplier_items")
      .select("id, item_no")
      .eq("company_id", faktura.company_id)
      .eq("active", true)
      .in("item_no", elnr);
    for (const v of varer ?? []) if (!katalog.has(v.item_no)) katalog.set(v.item_no, v.id);
  }

  const rader = ehf.lines
    .filter((l) => !alleredeKopla.has(l.lineNo))
    .map((l) => ({
      company_id: faktura.company_id,
      invoice_id: faktura.id,
      line_no: l.lineNo,
      item_no: l.elnr,
      gtin: l.gtin,
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unitPrice,
      line_total: l.lineTotal,
      vat_pct: l.vatPct,
      order_reference: l.orderReference ?? ehf.orderReference ?? null,
      supplier_item_id: l.elnr ? (katalog.get(l.elnr) ?? null) : null,
    }));
  if (rader.length) {
    const { error } = await admin.from("supplier_invoice_lines").insert(rader);
    if (error) throw new Error(`Kunne ikke lagre linjer: ${error.message}`);
  }
}

function referansar(
  hode: PogoInngaaandeFaktura | undefined,
  ehf: EhfFaktura | null,
  fraFoer: string[],
): string[] {
  const ut = new Set<string>(fraFoer ?? []);
  for (const r of [
    hode?.PurchaseOrderReference,
    hode?.CustomMatchingReference,
    hode?.ProjectCode,
    ehf?.orderReference,
    ehf?.buyerReference,
    ehf?.customerContactName,
    ehf?.note,
    ...(ehf?.lines.map((l) => l.orderReference) ?? []),
  ]) {
    if (r && r.trim()) ut.add(r.trim().slice(0, 120));
  }
  return [...ut];
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Ordrenummer → ordre for selskapet. Avbrutte teller ikke. */
async function gyldigeOrdrar(admin: SupabaseClient, companyId: string): Promise<Map<number, Order>> {
  const { data } = await admin
    .from("orders")
    .select("*")
    .eq("company_id", companyId)
    .neq("status", "avbrutt");
  return new Map(((data ?? []) as Order[]).map((o) => [o.order_no, o]));
}

async function matchAlle(
  admin: SupabaseClient,
  companyId: string,
  externalIds: string[],
): Promise<{ kopla: number; delvis: number; ukopla: number }> {
  const tal = { kopla: 0, delvis: 0, ukopla: 0 };
  if (!externalIds.length) return tal;

  const ordrar = await gyldigeOrdrar(admin, companyId);
  const gyldige = new Set(ordrar.keys());

  const { data: fakturaer } = await admin
    .from("supplier_invoices")
    .select("*")
    .eq("company_id", companyId)
    .in("external_id", externalIds);

  const { data: company } = await admin
    .from("companies")
    .select("materials_markup_pct")
    .eq("id", companyId)
    .single();
  const paaslag = Number(company?.materials_markup_pct ?? 25);

  for (const faktura of (fakturaer ?? []) as SupplierInvoice[]) {
    if (faktura.match_status === "ignorert") continue;

    // Kreditnota: vises, aldri koblet automatisk. Håndteres manuelt.
    const kreditnota = /credit/i.test(faktura.voucher_type);

    if (!kreditnota) {
      const hode = (faktura as unknown as { raw: Record<string, unknown> | null }).raw ?? {};
      const kandidatar = [
        str(hode.PurchaseOrderReference),
        ...faktura.references_found,
        str(hode.ProjectCode),
      ];
      const hovudTreff = finnOrdrenummer(kandidatar, gyldige);
      const hovudOrdre = hovudTreff ? (ordrar.get(hovudTreff) ?? null) : null;

      const { data: linjer } = await admin
        .from("supplier_invoice_lines")
        .select("*")
        .eq("invoice_id", faktura.id)
        .eq("status", "ukopla")
        .is("material_entry_id", null);

      for (const linje of (linjer ?? []) as SupplierInvoiceLine[]) {
        const linjeTreff = linje.order_reference ? finnOrdrenummer([linje.order_reference], gyldige) : null;
        const ordre = (linjeTreff ? ordrar.get(linjeTreff) : null) ?? hovudOrdre;
        if (!ordre) continue;
        await koplLinjeTilOrdre(admin, linje, faktura, ordre, paaslag);
      }

      // Uten EHF finnes bare hodet. Da kobles fakturaen som helhet til
      // ordren, uten materiell — så den ikke blir liggende som ukoblet for
      // alltid, og så ordren viser at det finnes en faktura på den.
      if (faktura.line_count === 0 && hovudOrdre && !faktura.order_id) {
        await admin.from("supplier_invoices").update({ order_id: hovudOrdre.id }).eq("id", faktura.id);
      }
    }

    const status = await oppdaterFakturaStatus(admin, faktura.id);
    if (status === "kopla") tal.kopla += 1;
    else if (status === "delvis") tal.delvis += 1;
    else if (status === "ukopla") tal.ukopla += 1;
  }
  return tal;
}

/**
 * Kobler én linje til en ordre og lager materiell — når ordren tar imot
 * føringer. En fakturert eller avbrutt ordre får linja koblet, men ingen
 * materiell: den kom etter fakturering, og noen må se på den.
 */
export async function koplLinjeTilOrdre(
  admin: SupabaseClient,
  linje: SupplierInvoiceLine,
  faktura: Pick<SupplierInvoice, "invoice_no" | "voucher_no" | "company_id">,
  ordre: Pick<Order, "id" | "status">,
  paaslag: number,
): Promise<void> {
  const laast = ordre.status === "fakturert" || ordre.status === "avbrutt";
  if (laast) {
    await admin
      .from("supplier_invoice_lines")
      .update({ order_id: ordre.id, status: "kopla" })
      .eq("id", linje.id);
    return;
  }
  await opprettMateriellFraLinje(admin, linje, faktura, ordre.id, paaslag);
}

/** Materiell-linje fra en fakturalinje: kost fra fakturaen, påslag fra selskapet. */
export async function opprettMateriellFraLinje(
  admin: SupabaseClient,
  linje: SupplierInvoiceLine,
  faktura: Pick<SupplierInvoice, "invoice_no" | "voucher_no" | "company_id">,
  orderId: string,
  paaslag: number,
): Promise<string> {
  const kost = Number(linje.unit_price);
  const { data: ny, error } = await admin
    .from("material_entries")
    .insert({
      company_id: faktura.company_id,
      order_id: orderId,
      source: "faktura",
      supplier_item_id: linje.supplier_item_id,
      invoice_line_id: linje.id,
      item_no: linje.item_no,
      name: linje.name,
      unit: linje.unit,
      quantity: Number(linje.quantity),
      cost_price: kost,
      markup_pct: paaslag,
      sale_price: salspris(kost, paaslag),
      note: `Faktura ${faktura.invoice_no ?? faktura.voucher_no ?? ""}`.trim(),
      registered_by: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Kunne ikke lage materiell: ${error.message}`);

  await admin
    .from("supplier_invoice_lines")
    .update({ order_id: orderId, material_entry_id: ny.id, status: "kopla" })
    .eq("id", linje.id);

  // Montørens egen føring av samme vare på samme ordre er nå dekket av
  // fakturaen. Den står igjen, ute av summen, merket erstattet.
  if (linje.item_no) {
    await admin
      .from("material_entries")
      .update({ replaced_by: ny.id })
      .eq("order_id", orderId)
      .eq("source", "manuell")
      .eq("item_no", linje.item_no)
      .is("replaced_by", null)
      .is("invoice_line_id", null);
  }
  return ny.id;
}

/** Løser en linje fra ordren: materiell bort, erstattede linjer tilbake. */
export async function loysLinje(admin: SupabaseClient, linje: SupplierInvoiceLine): Promise<void> {
  if (linje.material_entry_id) {
    await admin
      .from("material_entries")
      .update({ replaced_by: null })
      .eq("replaced_by", linje.material_entry_id);
    await admin.from("material_entries").delete().eq("id", linje.material_entry_id);
  }
  await admin
    .from("supplier_invoice_lines")
    .update({ order_id: null, material_entry_id: null, status: "ukopla" })
    .eq("id", linje.id);
}

/**
 * Regner ut fakturaens status fra linjene. Alle koblet → koblet; noen →
 * delvis; ingen → ukoblet. Én felles ordre for alle koblede linjer settes
 * som fakturaens ordre. Ignorert står til noen angrer.
 */
export async function oppdaterFakturaStatus(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<InvoiceMatchStatus> {
  const { data: faktura } = await admin
    .from("supplier_invoices")
    .select("id, match_status, order_id")
    .eq("id", invoiceId)
    .single();
  if (!faktura) return "ukopla";
  if (faktura.match_status === "ignorert") return "ignorert";

  const { data: linjer } = await admin
    .from("supplier_invoice_lines")
    .select("status, order_id")
    .eq("invoice_id", invoiceId);
  const alle = linjer ?? [];

  // Ingen linjer (ingen EHF): koblingen er på hodet, og order_id avgjør.
  if (alle.length === 0) {
    const status: InvoiceMatchStatus = faktura.order_id ? "kopla" : "ukopla";
    await admin
      .from("supplier_invoices")
      .update({ match_status: status, line_count: 0, matched_line_count: 0 })
      .eq("id", invoiceId);
    return status;
  }
  const kopla = alle.filter((l) => l.status === "kopla");
  const ordrar = new Set(kopla.map((l) => l.order_id).filter(Boolean));

  const status: InvoiceMatchStatus =
    alle.length > 0 && kopla.length === alle.length ? "kopla" : kopla.length > 0 ? "delvis" : "ukopla";

  await admin
    .from("supplier_invoices")
    .update({
      match_status: status,
      line_count: alle.length,
      matched_line_count: kopla.length,
      order_id: ordrar.size === 1 ? [...ordrar][0] : null,
    })
    .eq("id", invoiceId);
  return status;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function melding(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
