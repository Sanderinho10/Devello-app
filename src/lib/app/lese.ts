import type { SupabaseClient } from "@supabase/supabase-js";
import { lovligeOverganger } from "@/lib/ordre/status";
import type { MaterialEntry, Order, OrderDocument, OrderNote, OrderStatus, TimeEntry } from "@/lib/types";

/**
 * Det montørappen leser. Rene spørringer med service role og eksplisitt
 * company_id — samme grep som skrive-rutene. Feltnavnene er databasens
 * (snake_case), så appen deler typene med nettappen.
 */

export const APP_API_VERSION = 1;

/** Aktive timetyper: rader av typen «time» i aktive lister. Samme regel som hentTimetype. */
export async function hentTimetypar(admin: SupabaseClient, companyId: string) {
  const { data } = await admin
    .from("price_list_items")
    .select("id, name, unit_price, price_lists!inner(active)")
    .eq("company_id", companyId)
    .eq("kind", "time")
    .eq("active", true)
    .eq("price_lists.active", true)
    .order("name");
  return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, unit_price: Number(t.unit_price) }));
}

const AKTIVE: OrderStatus[] = ["opna", "paagaar", "ferdig"];
const REKKJEFOELGJE: Record<OrderStatus, number> = { paagaar: 0, opna: 1, ferdig: 2, fakturert: 3, avbrutt: 4 };

export interface OrdreIListe {
  id: string;
  order_no: number;
  status: OrderStatus;
  title: string;
  customer_name: string;
  customer_phone: string | null;
  site_address: string | null;
  updated_at: string;
  /** Innlogget brukers timer på ordren. */
  mine_timar: number;
}

/**
 * Ordrelista for appen. «aktive» = åpen, pågår, ferdig (ferdig kan
 * fortsatt føres på). Pågår først, så åpen, så ferdig; nyest oppdatert
 * øverst innenfor det. Søket treffer ordrenummer (prefiks), tittel og
 * kundenavn. Timene til brukeren summeres i én spørring, ikke én per ordre.
 */
export async function hentOrdreliste(
  admin: SupabaseClient,
  companyId: string,
  userId: string,
  opts: { status: "aktive" | "alle"; q: string; limit: number },
): Promise<OrdreIListe[]> {
  let sporring = admin
    .from("orders")
    .select("id, order_no, status, title, customer_name, customer_phone, site_address, updated_at")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (opts.status === "aktive") sporring = sporring.in("status", AKTIVE);
  const { data } = await sporring;

  const q = opts.q.trim().toLowerCase();
  let ordrar = ((data ?? []) as Omit<OrdreIListe, "mine_timar">[]).filter((o) => {
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(o.order_no).startsWith(q);
    return o.title.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
  });
  ordrar = ordrar
    .sort((a, b) => REKKJEFOELGJE[a.status] - REKKJEFOELGJE[b.status] || (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, opts.limit);

  const timar = new Map<string, number>();
  if (ordrar.length) {
    const { data: rader } = await admin
      .from("time_entries")
      .select("order_id, hours")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .in("order_id", ordrar.map((o) => o.id));
    for (const r of rader ?? []) timar.set(r.order_id, (timar.get(r.order_id) ?? 0) + Number(r.hours));
  }
  return ordrar.map((o) => ({ ...o, mine_timar: Math.round((timar.get(o.id) ?? 0) * 100) / 100 }));
}

export interface BileteIApp {
  id: string;
  title: string;
  file_name: string | null;
  created_at: string;
  note_id: string | null;
}

export interface OrdreIApp {
  ordre: Omit<Order, "quote_snapshot">;
  timer: (TimeEntry & { user_name: string })[];
  materiell: MaterialEntry[];
  notat: (OrderNote & { user_name: string; bilete: BileteIApp[] })[];
  bilete: BileteIApp[];
  lovlege_overgangar: OrderStatus[];
}

/** Én ordre med alt appen viser. Timer og materiell fra alle — montøren skal se kollegaenes. */
export async function hentOrdreForApp(admin: SupabaseClient, companyId: string, orderId: string): Promise<OrdreIApp | null> {
  const { data: rad } = await admin.from("orders").select("*").eq("id", orderId).eq("company_id", companyId).maybeSingle();
  if (!rad) return null;
  const { quote_snapshot: _snapshot, ...ordre } = rad as Order;
  void _snapshot;

  const [{ data: timer }, { data: materiell }, { data: notat }, { data: dokument }, { data: brukarar }] = await Promise.all([
    admin.from("time_entries").select("*").eq("order_id", orderId).eq("company_id", companyId).order("work_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    admin.from("material_entries").select("*").eq("order_id", orderId).eq("company_id", companyId).order("registered_at", { ascending: false }).limit(200),
    admin.from("order_notes").select("*").eq("order_id", orderId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
    admin.from("order_documents").select("id, title, file_name, created_at, note_id, kind, mime_type").eq("order_id", orderId).eq("company_id", companyId).order("created_at", { ascending: false }),
    admin.from("users").select("id, full_name, email").eq("company_id", companyId),
  ]);

  const namn = new Map((brukarar ?? []).map((u) => [u.id as string, (u.full_name as string | null) || (u.email as string) || ""]));
  const bilete: BileteIApp[] = ((dokument ?? []) as Pick<OrderDocument, "id" | "title" | "file_name" | "created_at" | "note_id" | "kind" | "mime_type">[])
    .filter((d) => d.kind === "fil" && (d.mime_type ?? "").startsWith("image/"))
    .map((d) => ({ id: d.id, title: d.title, file_name: d.file_name, created_at: d.created_at, note_id: d.note_id }));

  return {
    ordre,
    timer: ((timer ?? []) as TimeEntry[]).map((t) => ({ ...t, user_name: namn.get(t.user_id) ?? "" })),
    materiell: (materiell ?? []) as MaterialEntry[],
    notat: ((notat ?? []) as OrderNote[]).map((n) => ({ ...n, user_name: namn.get(n.user_id) ?? "", bilete: bilete.filter((b) => b.note_id === n.id) })),
    bilete,
    lovlege_overgangar: lovligeOverganger(ordre.status),
  };
}
