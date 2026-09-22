import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BILDE_MAKS_PX,
  MAKS_BILDER_TIL_MODELL,
  MAKS_FILSTORRELSE,
  MAKS_PDF_SIDER_TIL_MODELL,
  MAKS_VEDLEGG,
} from "./vedlegg-grenser";

/**
 * Vedlegg på leads: bildene og PDF-ene kunden sendte med.
 *
 * Tre steg. Normalisering ved lagring — typen avgjøres av innholdet, bilder
 * roteres etter EXIF og skaleres ned, PDF-er telles i sider. Lagring i egen
 * bucket med en rad per fil. Og ved generering: filene som innholdsblokker
 * til modellen, innenfor taket på bilder og sider.
 */

export type Vedleggstype = "bilde" | "pdf";

/** Typen ut fra de første bytene. Filnavn og oppgitt MIME-type lyver ofte. */
export function gjenkjenn(bytes: Uint8Array): Vedleggstype | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "pdf"; // %PDF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "bilde"; // JPEG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "bilde"; // PNG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "bilde"; // GIF
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "bilde"; // WEBP
  }
  return null;
}

export interface Normalisert {
  filnavn: string;
  bytes: Buffer;
  mime: "image/jpeg" | "application/pdf";
  sider: number | null;
}

/**
 * Gjør en fil klar for lagring, eller sier hvorfor den ikke blir med.
 *
 * Små bilder hoppes over: en logo i en e-postsignatur er ikke noe kunden
 * sendte, og Outlook merker ikke alltid slike som innebygde.
 */
export async function normaliser(
  filnavn: string,
  bytes: Buffer,
): Promise<Normalisert | { avvist: string }> {
  if (bytes.length > MAKS_FILSTORRELSE) {
    return { avvist: `${filnavn} er større enn ${MAKS_FILSTORRELSE / 1024 / 1024} MB` };
  }
  const type = gjenkjenn(bytes);
  if (!type) return { avvist: `${filnavn} er verken bilde eller PDF` };

  if (type === "pdf") {
    const sider = await tellSider(bytes);
    if (sider === null) return { avvist: `${filnavn} kunne ikke åpnes som PDF` };
    return { filnavn, bytes, mime: "application/pdf", sider };
  }

  const { default: sharp } = await import("sharp");
  try {
    const bilde = sharp(bytes, { failOn: "none", animated: false });
    const meta = await bilde.metadata();
    if ((meta.width ?? 0) < 200 && (meta.height ?? 0) < 200) {
      return { avvist: `${filnavn} er for lite til å vise noe (logo eller ikon)` };
    }
    const ut = await bilde
      .rotate() // etter EXIF: et mobilbilde står ellers ofte på siden
      .resize({
        width: BILDE_MAKS_PX,
        height: BILDE_MAKS_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" }) // gjennomsiktig PNG → hvit, ikke svart
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return {
      filnavn: filnavn.replace(/\.(png|gif|webp|jpe?g)$/i, "") + ".jpg",
      bytes: ut,
      mime: "image/jpeg",
      sider: null,
    };
  } catch {
    return { avvist: `${filnavn} kunne ikke leses som bilde` };
  }
}

async function tellSider(bytes: Buffer): Promise<number | null> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const info = await parser.getInfo();
    return info.total;
  } catch {
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Lagrer filene på leadet. Taket er per lead, også på tvers av flere
 * opplastinger. Returnerer hva som ble med og hva som ble avvist, så den som
 * lastet opp kan få vite det.
 */
export async function lagreVedlegg(
  admin: SupabaseClient,
  input: {
    companyId: string;
    leadId: string;
    kilde: "outlook" | "manuell";
    filer: { navn: string; bytes: Buffer }[];
  },
): Promise<{ lagra: number; avviste: string[] }> {
  const { count } = await admin
    .from("lead_attachments")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", input.leadId);
  let plass = MAKS_VEDLEGG - (count ?? 0);

  const avviste: string[] = [];
  let lagra = 0;

  for (const fil of input.filer) {
    if (plass <= 0) {
      avviste.push(`${fil.navn}: maks ${MAKS_VEDLEGG} vedlegg per henvendelse`);
      continue;
    }
    const n = await normaliser(fil.navn, fil.bytes);
    if ("avvist" in n) {
      avviste.push(n.avvist);
      continue;
    }

    const sti = `${input.companyId}/${input.leadId}/${Date.now()}-${lagra}-${trygt(n.filnavn)}`;
    const { error: opp } = await admin.storage
      .from("lead-attachments")
      .upload(sti, n.bytes, { contentType: n.mime, upsert: false });
    if (opp) {
      avviste.push(`${fil.navn}: lagring feilet`);
      continue;
    }

    const { error } = await admin.from("lead_attachments").insert({
      company_id: input.companyId,
      lead_id: input.leadId,
      file_name: n.filnavn,
      mime_type: n.mime,
      size_bytes: n.bytes.length,
      pages: n.sider,
      storage_path: sti,
      kilde: input.kilde,
    });
    if (error) {
      await admin.storage.from("lead-attachments").remove([sti]);
      avviste.push(`${fil.navn}: lagring feilet`);
      continue;
    }
    lagra += 1;
    plass -= 1;
  }

  return { lagra, avviste };
}

export interface VedleggRad {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  pages: number | null;
  storage_path: string;
}

export async function vedleggFor(admin: SupabaseClient, leadId: string): Promise<VedleggRad[]> {
  const { data } = await admin
    .from("lead_attachments")
    .select("id, file_name, mime_type, size_bytes, pages, storage_path")
    .eq("lead_id", leadId)
    .order("created_at")
    .order("id");
  return (data ?? []) as VedleggRad[];
}

/**
 * Hvilke vedlegg som går til modellen, innenfor taket. Ren funksjon, så
 * utvalget kan testes uten lagring.
 */
export function velgTilModell(rader: Pick<VedleggRad, "mime_type" | "pages">[]): boolean[] {
  let bilder = 0;
  let sider = 0;
  return rader.map((r) => {
    if (r.mime_type === "application/pdf") {
      const s = r.pages ?? 1;
      if (sider + s > MAKS_PDF_SIDER_TIL_MODELL) return false;
      sider += s;
      return true;
    }
    if (bilder >= MAKS_BILDER_TIL_MODELL) return false;
    bilder += 1;
    return true;
  });
}

export interface VedleggTilModell {
  /** Bilde- og dokumentblokker, med tittel foran hvert bilde. */
  blokker: Anthropic.ContentBlockParam[];
  /** Tekstblokk til prompten: hva som er med, og hva som ikke ble lest. */
  oversikt: string;
}

/**
 * Filene som innholdsblokker til modellen.
 *
 * Siste blokk får et cache-bruddpunkt. Vedleggene er de samme i alle kallene
 * én generering gjør — omfang, tilbud, eventuelle nye forsøk — så etter det
 * første leses de fra cachen til en tidel av prisen.
 */
export async function vedleggTilModell(
  admin: SupabaseClient,
  leadId: string,
): Promise<VedleggTilModell | null> {
  const rader = await vedleggFor(admin, leadId);
  if (rader.length === 0) return null;

  const med = velgTilModell(rader);
  const blokker: Anthropic.ContentBlockParam[] = [];
  const lest: string[] = [];
  const ikkeLest: string[] = [];

  for (const [i, rad] of rader.entries()) {
    const nr = i + 1;
    const beskrivelse = `Vedlegg ${nr}: ${rad.file_name}`;
    if (!med[i]) {
      ikkeLest.push(`${beskrivelse} (over taket på ${MAKS_BILDER_TIL_MODELL} bilder / ${MAKS_PDF_SIDER_TIL_MODELL} PDF-sider)`);
      continue;
    }
    const { data: blob } = await admin.storage.from("lead-attachments").download(rad.storage_path);
    if (!blob) {
      ikkeLest.push(`${beskrivelse} (filen mangler i lagringen)`);
      continue;
    }
    const data = Buffer.from(await blob.arrayBuffer()).toString("base64");

    if (rad.mime_type === "application/pdf") {
      blokker.push({
        type: "document",
        title: beskrivelse,
        source: { type: "base64", media_type: "application/pdf", data },
      });
      lest.push(`${beskrivelse} (PDF, ${rad.pages ?? "?"} ${rad.pages === 1 ? "side" : "sider"})`);
    } else {
      blokker.push({ type: "text", text: beskrivelse });
      blokker.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      });
      lest.push(`${beskrivelse} (bilde)`);
    }
  }

  const siste = blokker.at(-1);
  if (siste && (siste.type === "image" || siste.type === "document")) {
    siste.cache_control = { type: "ephemeral" };
  }

  return { blokker, oversikt: oversiktsblokk(lest, ikkeLest) };
}

export function oversiktsblokk(lest: string[], ikkeLest: string[]): string {
  const linjer = ["# Vedlegg", ""];
  if (lest.length > 0) {
    linjer.push(
      "Kunden sendte vedlegg med henvendelsen. De står over denne teksten, rett etter prislistene,",
      "i rekkefølgen under:",
      "",
      ...lest.map((l) => `- ${l}`),
      "",
      "Les dem som en del av leadet. Et bilde av sikringsskapet, en plantegning eller en",
      "tidligere befaring kan vise antall punkter, lengder, eksisterende anlegg eller",
      "tilkomst som teksten ikke sier. Mengder du leser ut av et vedlegg, er kilde «lead»",
      "når de står tydelig der, og skal nevnes i antakelser med vedleggsnummeret når du",
      "måtte anslå dem. Viser et vedlegg noe som endrer jobben (for eksempel et gammelt",
      "skap som må byttes), ta det med. Et vedlegg som ikke har med jobben å gjøre,",
      "overser du. Du skal aldri gjette på noe du ikke ser tydelig.",
    );
  }
  if (ikkeLest.length > 0) {
    if (lest.length > 0) linjer.push("");
    linjer.push(
      "Disse vedleggene ble IKKE sendt med, og du har ikke sett dem. Skriv i merknader",
      "at de bør sjekkes før tilbudet sendes:",
      "",
      ...ikkeLest.map((l) => `- ${l}`),
    );
  }
  return linjer.join("\n");
}

function trygt(navn: string): string {
  return navn.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
