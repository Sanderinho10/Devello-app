import type { SupabaseClient } from "@supabase/supabase-js";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
import type { OrderStatus } from "@/lib/types";
import { erHendingType, type HendingType } from "./tid";
import { naarTekst, type HendingForVarsel } from "./varsel";

/**
 * Kalenderen frå databasen. Service role og eksplisitt company_id, som
 * resten av ordremodulen. Same form går til nettsida og montørappen.
 */

export interface KalenderOrdre {
  id: string;
  order_no: number;
  title: string;
  customer_name: string;
  site_address: string | null;
  status: OrderStatus;
}

export interface KalenderHending {
  id: string;
  kind: HendingType;
  /** Tittelen slik han skal visast: eigen tittel, eller ordretittelen for eit oppdrag. */
  title: string;
  /** Det som faktisk står i feltet. Tom på eit oppdrag betyr ordretittelen. */
  egen_tittel: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  order: KalenderOrdre | null;
  deltakarar: { id: string; navn: string }[];
}

export interface Kollega {
  id: string;
  navn: string;
  role: string;
}

/** Alle i selskapet, sorterte på namn. Namnet er fullt namn, elles e-posten. */
export async function hentKolleger(admin: SupabaseClient, companyId: string): Promise<Kollega[]> {
  return (await brukereISelskap(admin, companyId))
    .map((k) => ({ id: k.id, navn: k.full_name?.trim() || k.email, role: k.role }))
    .sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
}

/**
 * Avtalane som overlappar [fra, til). Med brukarId: berre dei brukaren er
 * med på. Med orderId: berre dei på ordren (og då utan tidsrom om fra/til
 * er null).
 */
export async function hentHendingar(
  admin: SupabaseClient,
  companyId: string,
  opts: { fra: Date | null; til: Date | null; brukarId?: string | null; orderId?: string | null; id?: string },
): Promise<KalenderHending[]> {
  let eventIds: string[] | null = null;
  if (opts.brukarId) {
    const { data } = await admin
      .from("calendar_event_users")
      .select("event_id")
      .eq("company_id", companyId)
      .eq("user_id", opts.brukarId);
    eventIds = (data ?? []).map((r) => r.event_id as string);
    if (eventIds.length === 0) return [];
  }

  let q = admin
    .from("calendar_events")
    .select(
      "id, kind, title, description, location, starts_at, ends_at, all_day, order_id, orders(id, order_no, title, customer_name, site_address, status), calendar_event_users(user_id)",
    )
    .eq("company_id", companyId)
    .order("starts_at")
    .limit(2000);
  // Overlapp: startar før slutten og sluttar etter starten.
  if (opts.til) q = q.lt("starts_at", opts.til.toISOString());
  if (opts.fra) q = q.gt("ends_at", opts.fra.toISOString());
  if (opts.orderId) q = q.eq("order_id", opts.orderId);
  if (opts.id) q = q.eq("id", opts.id);
  if (eventIds) q = q.in("id", eventIds);

  const [{ data, error }, kolleger] = await Promise.all([q, hentKolleger(admin, companyId)]);
  if (error) throw new Error(error.message);
  const namn = new Map(kolleger.map((k) => [k.id, k.navn]));

  return (data ?? []).map((r) => {
    const o = r.orders as unknown as KalenderOrdre | KalenderOrdre[] | null;
    const order = Array.isArray(o) ? (o[0] ?? null) : o;
    const deltakarar = ((r.calendar_event_users ?? []) as { user_id: string }[])
      .map((d) => ({ id: d.user_id, navn: namn.get(d.user_id) ?? "Tidligere ansatt" }))
      .sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
    const egen = (r.title as string) ?? "";
    return {
      id: r.id as string,
      kind: r.kind as HendingType,
      title: egen.trim() || (order ? order.title : "") || "Uten tittel",
      egen_tittel: egen,
      description: (r.description as string | null) ?? null,
      location: (r.location as string | null) ?? null,
      starts_at: r.starts_at as string,
      ends_at: r.ends_at as string,
      all_day: Boolean(r.all_day),
      order,
      deltakarar,
    };
  });
}

export interface HendingInput {
  kind: HendingType;
  order_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  deltakarar: string[];
}

const MAKS_TITTEL = 200;
const MAKS_TEKST = 4000;
const MAKS_LENGD_MS = 366 * 24 * 60 * 60 * 1000;

function tekst(v: unknown, maks: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, maks) : null;
}

/**
 * Les og sjekk ein avtale frå JSON. Gir ei feilmelding på norsk, eller
 * input som er klar til å lagrast. Om ordren og deltakarane høyrer til
 * selskapet, sjekkar kallaren mot databasen etterpå.
 */
export function lesHendingInput(body: Record<string, unknown>): HendingInput | { feil: string } {
  const kind = erHendingType(body.kind) ? body.kind : null;
  if (!kind) return { feil: "Velg hva slags avtale det er." };

  const order_id = typeof body.order_id === "string" && body.order_id ? body.order_id : null;
  if (kind === "oppdrag" && !order_id) return { feil: "Velg ordren oppdraget gjelder." };

  const title = tekst(body.title, MAKS_TITTEL) ?? "";
  if (kind !== "oppdrag" && !title) return { feil: "Skriv en tittel." };

  const start = typeof body.starts_at === "string" ? new Date(body.starts_at) : null;
  const slutt = typeof body.ends_at === "string" ? new Date(body.ends_at) : null;
  if (!start || !slutt || Number.isNaN(start.getTime()) || Number.isNaN(slutt.getTime())) {
    return { feil: "Velg når avtalen starter og slutter." };
  }
  if (slutt <= start) return { feil: "Slutten må være etter starten." };
  if (slutt.getTime() - start.getTime() > MAKS_LENGD_MS) return { feil: "En avtale kan vare høyst ett år." };

  const deltakarar = Array.isArray(body.deltakarar)
    ? [...new Set(body.deltakarar.filter((d): d is string => typeof d === "string" && d.length > 0))]
    : [];
  if (kind === "oppdrag" && deltakarar.length === 0) return { feil: "Velg hvem som skal på oppdraget." };

  return {
    kind,
    order_id: kind === "oppdrag" ? order_id : null,
    title,
    description: tekst(body.description, MAKS_TEKST),
    location: tekst(body.location, MAKS_TITTEL),
    starts_at: start.toISOString(),
    ends_at: slutt.toISOString(),
    all_day: body.all_day === true,
    deltakarar,
  };
}

/**
 * Ordren og deltakarane må høyre til selskapet. Ein id frå klienten er
 * aldri nok aleine.
 */
export async function sjekkTilhoyrsle(
  admin: SupabaseClient,
  companyId: string,
  input: HendingInput,
): Promise<{ feil: string } | { order: { id: string; order_no: number; title: string } | null; namn: Map<string, string> }> {
  const kolleger = await hentKolleger(admin, companyId);
  const namn = new Map(kolleger.map((k) => [k.id, k.navn]));
  if (input.deltakarar.some((id) => !namn.has(id))) return { feil: "En av deltakerne er ikke med i selskapet." };

  if (!input.order_id) return { order: null, namn };
  const { data } = await admin
    .from("orders")
    .select("id, order_no, title")
    .eq("id", input.order_id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) return { feil: "Fant ikke ordren." };
  return { order: data as { id: string; order_no: number; title: string }, namn };
}

/** Skriv deltakarane på nytt: dei som er valde, verken fleire eller færre. */
export async function lagreDeltakarar(
  admin: SupabaseClient,
  companyId: string,
  eventId: string,
  deltakarar: string[],
): Promise<void> {
  const { error: slettFeil } = await admin.from("calendar_event_users").delete().eq("event_id", eventId);
  if (slettFeil) throw new Error(slettFeil.message);
  if (deltakarar.length === 0) return;
  const { error } = await admin
    .from("calendar_event_users")
    .insert(deltakarar.map((user_id) => ({ event_id: eventId, user_id, company_id: companyId })));
  if (error) throw new Error(error.message);
}

/** «Noah Hansen · man. 9. nov. 10:00–15:00» til hendingsloggen på ordren. Norsk tid. */
export function loggTekst(input: HendingInput, namn: Map<string, string>): string {
  const kven = input.deltakarar.map((id) => namn.get(id) ?? "").filter(Boolean).join(", ");
  return [kven, naarTekst(input)].filter(Boolean).join(" · ");
}

/** Éin avtale, i forma varsla treng. Null når han ikkje finst. */
export async function hentForVarsel(admin: SupabaseClient, companyId: string, id: string): Promise<HendingForVarsel | null> {
  const [h] = await hentHendingar(admin, companyId, { fra: null, til: null, id });
  return h ? tilVarsel(h) : null;
}

export function tilVarsel(h: KalenderHending): HendingForVarsel {
  return {
    kind: h.kind,
    order_id: h.order?.id ?? null,
    order_no: h.order?.order_no ?? null,
    title: h.title,
    location: h.location,
    site_address: h.order?.site_address ?? null,
    starts_at: h.starts_at,
    ends_at: h.ends_at,
    all_day: h.all_day,
    deltakarar: h.deltakarar.map((d) => d.id),
  };
}
