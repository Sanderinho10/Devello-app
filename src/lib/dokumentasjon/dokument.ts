import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finnMal } from "./malar";
import type { DokumentData, Mal, PrefillKontekst } from "./malar/typar";
import { manglandePaakravde } from "./motor";
import { BoligmappaFeil, boligmappaClient, velgType } from "@/lib/boligmappa/client";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { renderDokumentHtml } from "@/lib/pdf/dokument-template";
import { logoDataUri } from "@/lib/pdf/logo";
import { htmlToPdf } from "@/lib/pdf/render";
import type { SessionContext } from "@/lib/supabase/server";
import type { Order, OrderDocument } from "@/lib/types";

export const BUCKET = "order-documents";

/** Modulen er på (403), ordren er selskapets (404), dokumentet hører til ordren (404). */
export async function ordreOgDokument(
  admin: SupabaseClient,
  session: SessionContext,
  orderId: string,
  docId?: string,
): Promise<{ ordre: Order; dok: OrderDocument | null } | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;
  const { data: ordre } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!ordre) return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });
  if (!docId) return { ordre: ordre as Order, dok: null };
  const { data: dok } = await admin
    .from("order_documents")
    .select("*")
    .eq("id", docId)
    .eq("order_id", orderId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!dok) return NextResponse.json({ error: "Fant ikke dokumentet" }, { status: 404 });
  return { ordre: ordre as Order, dok: dok as OrderDocument };
}

/** Firma, ordre og bruker slik malene forhåndsutfylles. */
export async function prefillKontekst(admin: SupabaseClient, ordre: Order, userId: string): Promise<PrefillKontekst> {
  const [{ data: company }, { data: user }] = await Promise.all([
    admin
      .from("companies")
      .select("name, org_nr, billing_address_line, billing_postal_code, billing_city")
      .eq("id", ordre.company_id)
      .single(),
    admin.from("users").select("full_name, email").eq("id", userId).maybeSingle(),
  ]);
  const adresse = [company?.billing_address_line, [company?.billing_postal_code, company?.billing_city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    company: { name: company?.name ?? "", org_nr: company?.org_nr ?? null, address: adresse || null },
    order: {
      order_no: ordre.order_no,
      title: ordre.title,
      description: ordre.description,
      customer_name: ordre.customer_name,
      site_address: ordre.site_address,
    },
    user: { name: user?.full_name || user?.email || "" },
    today: new Date().toISOString().slice(0, 10),
  };
}

export function malFor(dok: Pick<OrderDocument, "kind" | "template_key">): Mal | null {
  if (dok.kind !== "skjema" || !dok.template_key) return null;
  return finnMal(dok.template_key);
}

/**
 * PDF-en for et skjema, med firmaets merkevare, lagret i order-documents.
 * Kalles ved «Fullfør og signer» — signaturblokka er med når signatur er
 * satt, ellers merkes arket UTKAST (forhåndsvisning).
 */
export async function lagDokumentPdf(
  admin: SupabaseClient,
  ordre: Order,
  dok: OrderDocument,
  signatur: { name: string; at: string } | null,
): Promise<{ bytes: Buffer; path: string }> {
  const mal = malFor(dok);
  if (!mal) throw new Error("Dokumentet er ikke et skjema.");
  const [{ data: company }, { data: brand }] = await Promise.all([
    admin
      .from("companies")
      .select("name, org_nr, billing_address_line, billing_postal_code, billing_city")
      .eq("id", ordre.company_id)
      .single(),
    admin.from("company_brand").select("*").eq("company_id", ordre.company_id).maybeSingle(),
  ]);
  const html = renderDokumentHtml({
    mal,
    data: dok.data as DokumentData,
    brand: brand ?? {},
    companyName: company?.name ?? "",
    orgNr: company?.org_nr ?? null,
    logoSrc: await logoDataUri(admin, brand?.logo_path),
    address: {
      line: company?.billing_address_line ?? null,
      postalCode: company?.billing_postal_code ?? null,
      city: company?.billing_city ?? null,
    },
    ordre: { order_no: ordre.order_no, title: ordre.title, site_address: ordre.site_address, customer_name: ordre.customer_name },
    signatur,
  });
  const bytes = await htmlToPdf(html);
  const path = `${ordre.company_id}/${ordre.id}/${dok.id}.pdf`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(`Kunne ikke lagre PDF: ${error.message}`);
  return { bytes, path };
}

export function klarTilFullfoering(dok: OrderDocument): string[] {
  const mal = malFor(dok);
  if (!mal) return [];
  return manglandePaakravde(mal, dok.data as DokumentData);
}

/**
 * Sender ett dokument til Boligmappa: plant finnes/opprettes (cachet per
 * eiendom), typene slås opp etter navn fra malen, fila registreres og
 * lastes opp. Idempotent — har dokumentet alt en fil-id, skjer ingenting.
 */
export async function sendTilBoligmappa(
  admin: SupabaseClient,
  ordre: Order,
  dok: OrderDocument,
  valg: { chapterTagName?: string | null } = {},
): Promise<{ ok: true; fileId: string; alleredeSendt: boolean } | { ok: false; error: string; status: number }> {
  if (dok.boligmappa_file_id) return { ok: true, fileId: dok.boligmappa_file_id, alleredeSendt: true };
  if (!ordre.boligmappa_number) return { ok: false, error: "Ordren har ingen eiendom i Boligmappa. Finn eiendommen først.", status: 400 };
  if (dok.kind === "skjema" && dok.status !== "ferdig") return { ok: false, error: "Fullfør og signer skjemaet før det sendes.", status: 400 };

  const sti = dok.kind === "skjema" ? dok.pdf_path : dok.storage_path;
  if (!sti) return { ok: false, error: "Dokumentet har ingen fil å sende.", status: 400 };

  try {
    const bm = await boligmappaClient(admin, ordre.company_id);

    // Plant: fra cachen, ellers fra Boligmappa.
    const { data: cachet } = await admin
      .from("boligmappa_plants")
      .select("plant_id")
      .eq("company_id", ordre.company_id)
      .eq("boligmappa_number", ordre.boligmappa_number)
      .maybeSingle();
    if (!cachet) {
      const plantId = await bm.finnEllerOpprettPlant(ordre.boligmappa_number);
      await admin
        .from("boligmappa_plants")
        .upsert({ company_id: ordre.company_id, boligmappa_number: ordre.boligmappa_number, plant_id: plantId });
    }

    const typer = await bm.typer();
    const mal = malFor(dok);
    const { data: company } = await admin.from("companies").select("fag").eq("id", ordre.company_id).single();
    const fagNamn = fagTilBoligmappa(company?.fag);
    const kapittel = velgType(typer.chapterTags, valg.chapterTagName ?? mal?.boligmappa.chapterTagName ?? "Samsvarserklæringer", "Annet");
    const dokType = velgType(typer.documentTypes, mal?.boligmappa.documentTypeName ?? "Undefinert", "Annet");
    const fag = velgType(typer.professionTypes, fagNamn);
    if (!kapittel || !dokType || !fag) {
      return { ok: false, error: "Fant ikke kapittel, dokumenttype eller fag i Boligmappa.", status: 502 };
    }

    const { data: fil, error: nedlastFeil } = await admin.storage.from(BUCKET).download(sti);
    if (nedlastFeil || !fil) throw new Error(`Kunne ikke lese fila: ${nedlastFeil?.message ?? "ukjent"}`);
    const bytes = Buffer.from(await fil.arrayBuffer());
    const contentType = dok.kind === "skjema" ? "application/pdf" : dok.mime_type || "application/octet-stream";
    const fileName = dok.kind === "skjema" ? `${slug(dok.title)}-ordre-${ordre.order_no}.pdf` : dok.file_name || `fil-${dok.id}`;

    const fileId = await bm.lastOppFil(
      ordre.boligmappa_number,
      {
        fileName,
        title: dok.title,
        description: `${dok.title} — ordre ${ordre.order_no}${ordre.title ? `, ${ordre.title}` : ""}`,
        orderNumber: String(ordre.order_no),
        chapterTagId: kapittel.id,
        professionTypeId: fag.id,
        documentTypeId: dokType.id,
      },
      bytes,
      contentType,
    );

    await admin
      .from("order_documents")
      .update({ boligmappa_file_id: fileId, boligmappa_sent_at: new Date().toISOString(), boligmappa_error: null })
      .eq("id", dok.id);
    return { ok: true, fileId, alleredeSendt: false };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    await admin.from("order_documents").update({ boligmappa_error: m }).eq("id", dok.id);
    return { ok: false, error: m, status: err instanceof BoligmappaFeil ? (err.status === 401 ? 400 : 502) : 502 };
  }
}

/** Fagets navn slik Boligmappa kaller det. Ukjent → elektriker, som resten av appen. */
function fagTilBoligmappa(fag: string | null | undefined): string {
  const f = (fag ?? "elektro").toLowerCase();
  if (f.startsWith("elektro")) return "Elektriker";
  if (f.startsWith("rør") || f.startsWith("ror") || f.startsWith("vvs")) return "Rørlegger";
  if (f.startsWith("tøm") || f.startsWith("tom")) return "Tømrer";
  return fag ?? "Elektriker";
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
