import type { SupabaseClient } from "@supabase/supabase-js";
import { hendelseTekst } from "@/lib/ordre/hendelse";

/**
 * Aktivitetsloggen: hvem gjorde hva med et tilbud eller en faktura.
 *
 * Ordren har sin egen logg (order_events). Historikk-knappen viser begge på
 * samme måte, så denne fila har også oversettelsen derfra.
 */

export type AktivitetObjekt = "tilbud" | "faktura";

/** Det som står i historikken: en handling, hvem og når. */
export interface HistorikkPost {
  id: string;
  tekst: string;
  /** Navnet på brukeren. Null når ingen person sto bak, eller vi ikke vet. */
  navn: string | null;
  tid: string;
}

/** Handlingene og hvordan de leses. Ukjente vises som de er lagret. */
const HANDLINGER: Record<string, string> = {
  // Tilbud
  opprettet_manuelt: "Henvendelse registrert",
  generert: "Utkast laget av tilbudsagenten",
  bekreftet: "Tilbud bekreftet",
  sendt: "Tilbud markert som sendt",
  ny_versjon: "Ny versjon åpnet",
  ordre_opprettet: "Ordre opprettet",
  // Faktura
  opprettet: "Faktura opprettet",
  forslag: "Fakturaforslag laget",
  godkjent: "Faktura godkjent",
  godkjenning_angret: "Godkjenning angret",
  overfort: "Overført til regnskap",
};

/**
 * Skriver én handling. Feiler aldri høyt: loggen skal ikke stoppe et tilbud
 * eller en faktura fra å gå ut. Feilen står i serverloggen.
 */
export async function loggAktivitet(
  admin: SupabaseClient,
  input: {
    companyId: string;
    objekt: AktivitetObjekt;
    objektId: string;
    handling: keyof typeof HANDLINGER | (string & {});
    detalj?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("aktivitet").insert({
    company_id: input.companyId,
    objekt: input.objekt,
    objekt_id: input.objektId,
    handling: input.handling,
    detalj: input.detalj ?? null,
    user_id: input.userId ?? null,
  });
  if (error) {
    console.error(
      `aktivitet: klarte ikke å logge «${input.handling}» for ${input.objekt} ${input.objektId}: ${error.message}`,
    );
  }
}

/** Historikken for ett tilbud eller én faktura, nyeste først. */
export async function hentAktivitet(
  admin: SupabaseClient,
  input: { companyId: string; objekt: AktivitetObjekt; objektId: string },
): Promise<HistorikkPost[]> {
  const { data, error } = await admin
    .from("aktivitet")
    .select("id, handling, detalj, user_id, created_at")
    .eq("company_id", input.companyId)
    .eq("objekt", input.objekt)
    .eq("objekt_id", input.objektId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    // Tabellen kan mangle før migrasjonen er kjørt. Da er historikken tom,
    // ikke en feilside.
    console.error(`aktivitet: klarte ikke å hente historikk: ${error.message}`);
    return [];
  }

  const navn = await navnFor(
    admin,
    (data ?? []).map((r) => r.user_id),
  );
  return (data ?? []).map((r) => ({
    id: r.id,
    tekst: aktivitetTekst(r.handling, r.detalj),
    navn: r.user_id ? (navn.get(r.user_id) ?? null) : null,
    tid: r.created_at,
  }));
}

export function aktivitetTekst(handling: string, detalj: string | null): string {
  const tekst = HANDLINGER[handling] ?? handling;
  return detalj ? `${tekst} — ${detalj}` : tekst;
}

/** Brukernavn for en liste med id-er. Faller tilbake til e-posten. */
export async function navnFor(
  admin: SupabaseClient,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unike = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unike.length === 0) return new Map();
  const { data } = await admin.from("users").select("id, full_name, email").in("id", unike);
  return new Map((data ?? []).map((u) => [u.id, u.full_name?.trim() || u.email]));
}

/**
 * Historikken for en ordre: ordreloggen (order_events) og det som har skjedd
 * med fakturaen på ordren, i én liste.
 *
 * Overføringen står allerede i ordreloggen, så den hoppes over fra
 * fakturaen.
 */
export async function hentOrdreHistorikk(
  admin: SupabaseClient,
  input: { companyId: string; orderId: string },
): Promise<HistorikkPost[]> {
  const [{ data: hendelser }, { data: fakturaer }] = await Promise.all([
    admin
      .from("order_events")
      .select("id, kind, note, created_by, created_at")
      .eq("order_id", input.orderId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("invoice_drafts")
      .select("id")
      .eq("order_id", input.orderId)
      .eq("company_id", input.companyId),
  ]);

  const fakturaIder = (fakturaer ?? []).map((f) => f.id);
  const { data: faktura } = fakturaIder.length
    ? await admin
        .from("aktivitet")
        .select("id, handling, detalj, user_id, created_at")
        .eq("company_id", input.companyId)
        .eq("objekt", "faktura")
        .in("objekt_id", fakturaIder)
        .neq("handling", "overfort")
    : { data: [] };

  const navn = await navnFor(admin, [
    ...(hendelser ?? []).map((h) => h.created_by),
    ...(faktura ?? []).map((f) => f.user_id),
  ]);

  const poster: HistorikkPost[] = [
    ...(hendelser ?? []).map((h) => ({
      id: h.id,
      tekst: hendelseTekst(h),
      navn: h.created_by ? (navn.get(h.created_by) ?? null) : null,
      tid: h.created_at,
    })),
    ...(faktura ?? []).map((f) => ({
      id: f.id,
      tekst: aktivitetTekst(f.handling, f.detalj),
      navn: f.user_id ? (navn.get(f.user_id) ?? null) : null,
      tid: f.created_at,
    })),
  ];
  return poster.sort((a, b) => Date.parse(b.tid) - Date.parse(a.tid));
}
