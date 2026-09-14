import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";
import { ordreErLaast } from "./hent";
import { ordreModulEllers403 } from "./tilgang";

/**
 * Felles inngang for rutene som skriver på en ordre.
 *
 * Tre sjekker i fast rekkefølge: modulen er på (403), ordren er selskapets
 * (404 — tilgangssjekken ligger i spørringen), og ordren er ikke avsluttet
 * (400). Får kalleren en NextResponse tilbake, sendes den rett ut.
 */
export async function ordreForSkriving(
  admin: SupabaseClient,
  session: SessionContext,
  orderId: string,
): Promise<Order | NextResponse> {
  const avvist = await ordreModulEllers403(admin, session.companyId);
  if (avvist) return avvist;

  const { data } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("company_id", session.companyId)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });
  }
  const order = data as Order;
  if (ordreErLaast(order)) {
    return NextResponse.json(
      { error: "Ordren er avsluttet og kan ikke føres på." },
      { status: 400 },
    );
  }
  return order;
}

/**
 * Timetypen må være en aktiv rad av typen «time» i en aktiv liste hos
 * selskapet. Samme regel som agenten følger: en deaktivert liste skal ikke
 * kunne snike seg inn.
 */
export async function hentTimetype(
  admin: SupabaseClient,
  companyId: string,
  priceItemId: unknown,
): Promise<{ id: string; name: string; unit_price: number } | null> {
  if (typeof priceItemId !== "string" || !priceItemId) return null;
  const { data } = await admin
    .from("price_list_items")
    .select("id, name, unit_price, price_lists!inner(active)")
    .eq("id", priceItemId)
    .eq("company_id", companyId)
    .eq("kind", "time")
    .eq("active", true)
    .eq("price_lists.active", true)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, name: data.name, unit_price: Number(data.unit_price) };
}

/** Er den innloggede administrator i sitt selskap? */
export async function erAdmin(admin: SupabaseClient, session: SessionContext): Promise<boolean> {
  const { data } = await admin.from("users").select("role").eq("id", session.userId).single();
  return data?.role === "admin";
}

/** Et tall fra JSON, eller null. «12,5» godtas — montøren skriver med komma. */
export function tal(verdi: unknown): number | null {
  if (typeof verdi === "number") return Number.isFinite(verdi) ? verdi : null;
  if (typeof verdi === "string") {
    const n = Number(verdi.replace(",", ".").trim());
    return Number.isFinite(n) && verdi.trim() !== "" ? n : null;
  }
  return null;
}

/** YYYY-MM-DD, ellers null. */
export function dato(verdi: unknown): string | null {
  if (typeof verdi !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(verdi)) return null;
  return Number.isNaN(new Date(verdi).getTime()) ? null : verdi;
}
