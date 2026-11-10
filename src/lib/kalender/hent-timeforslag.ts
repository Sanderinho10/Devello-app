import type { SupabaseClient } from "@supabase/supabase-js";
import { hentTimetypar } from "@/lib/app/lese";
import { hentHendingar, hentKolleger } from "./hent";
import { datoarMellom, osloDag } from "./oslo";
import { lagTimeforslag } from "./timeforslag";

export interface TimeforslagUt {
  user_id: string;
  user_name: string;
  order: { id: string; order_no: number; title: string; customer_name: string };
  work_date: string;
  /** Første start og siste slutt den dagen (ISO). */
  fra: string;
  til: string;
  timar: number;
  event_ids: string[];
  /** Timetypen montøren brukte sist (helst på same ordre), elles den første i lista. */
  price_item_id: string | null;
  time_type_name: string | null;
}

/**
 * Timeforslag frå kalenderen for datoane fra–til (norsk tid, begge med).
 * Avslutta ordrar (fakturert, avbrutt) får ikkje forslag — dei kan ikkje
 * førast på.
 */
export async function hentTimeforslag(
  admin: SupabaseClient,
  companyId: string,
  opts: { fra: string; til: string; brukarId?: string | null; orderId?: string | null },
): Promise<TimeforslagUt[]> {
  const dagar = datoarMellom(opts.fra, opts.til).map((dato) => ({ dato, ...osloDag(dato) }));
  if (dagar.length === 0) return [];

  let foertQ = admin
    .from("time_entries")
    .select("order_id, user_id, work_date, hours")
    .eq("company_id", companyId)
    .gte("work_date", opts.fra)
    .lte("work_date", opts.til);
  if (opts.brukarId) foertQ = foertQ.eq("user_id", opts.brukarId);
  if (opts.orderId) foertQ = foertQ.eq("order_id", opts.orderId);

  const [hendingar, { data: foert }, kolleger, timetypar] = await Promise.all([
    hentHendingar(admin, companyId, {
      fra: dagar[0].start,
      til: dagar[dagar.length - 1].slutt,
      brukarId: opts.brukarId,
      orderId: opts.orderId,
    }),
    foertQ,
    hentKolleger(admin, companyId),
    hentTimetypar(admin, companyId),
  ]);

  const oppdrag = hendingar.filter((h) => h.kind === "oppdrag" && h.order && h.order.status !== "fakturert" && h.order.status !== "avbrutt");
  const forslag = lagTimeforslag({
    oppdrag: oppdrag.map((h) => ({ ...h, order_id: h.order!.id, deltakarar: h.deltakarar.map((d) => d.id) })),
    foert: (foert ?? []).map((f) => ({ ...f, hours: Number(f.hours) })),
    dagar,
    no: new Date(),
    brukarar: opts.brukarId ? new Set([opts.brukarId]) : undefined,
  });
  if (forslag.length === 0) return [];

  // Sist brukte timetype per montør, helst på same ordre.
  const brukarar = [...new Set(forslag.map((f) => f.user_id))];
  const { data: siste } = await admin
    .from("time_entries")
    .select("user_id, order_id, price_item_id")
    .eq("company_id", companyId)
    .in("user_id", brukarar)
    .not("price_item_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const aktive = new Map(timetypar.map((t) => [t.id, t]));
  const typeFor = (userId: string, orderId: string) => {
    const rader = (siste ?? []).filter((r) => r.user_id === userId && aktive.has(r.price_item_id as string));
    const id = (rader.find((r) => r.order_id === orderId) ?? rader[0])?.price_item_id as string | undefined;
    return (id && aktive.get(id)) || timetypar[0] || null;
  };

  const namn = new Map(kolleger.map((k) => [k.id, k.navn]));
  const ordrar = new Map(oppdrag.map((h) => [h.order!.id, h.order!]));
  return forslag.map((f) => {
    const o = ordrar.get(f.order_id)!;
    const type = typeFor(f.user_id, f.order_id);
    return {
      user_id: f.user_id,
      user_name: namn.get(f.user_id) ?? "",
      order: { id: o.id, order_no: o.order_no, title: o.title, customer_name: o.customer_name },
      work_date: f.work_date,
      fra: f.fra,
      til: f.til,
      timar: f.timar,
      event_ids: f.event_ids,
      price_item_id: type?.id ?? null,
      time_type_name: type?.name ?? null,
    };
  });
}
