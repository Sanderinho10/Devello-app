import type { SupabaseClient } from "@supabase/supabase-js";
import { hentTimetype } from "@/lib/ordre/api";
import { ordreErLaast } from "@/lib/ordre/hent";
import type { InternalActivity, Order, TimeEntry } from "@/lib/types";

/**
 * Felles for timeregisteret: interne aktivitetar og flytting av timar.
 *
 * Ei timeføring høyrer anten til ein ordre eller til ein intern aktivitet.
 * Å flytte ho er å byte kva ho heng på — og sidan interntid ikkje har pris
 * og ikkje skal fakturerast, følgjer pris og fakturerbar med flyttinga.
 */

/** Det nye selskap startar med. Same liste som migrasjon 0068 legg inn. */
export const STANDARD_AKTIVITETAR = [
  "Møte",
  "Kurs og opplæring",
  "Lager og verksted",
  "Kjøring",
  "Administrasjon",
  "Annet",
];

/**
 * Aktivitetane i selskapet. Eit selskap som aldri har hatt nokon, får
 * standardlista første gong — så interntid verkar utan oppsett.
 */
export async function hentAktivitetar(
  admin: SupabaseClient,
  companyId: string,
  opts: { ogsaaInaktive?: boolean } = {},
): Promise<InternalActivity[]> {
  const les = async () => {
    const { data, error } = await admin
      .from("internal_activities")
      .select("*")
      .eq("company_id", companyId)
      .order("position")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as InternalActivity[];
  };
  let alle = await les();
  if (alle.length === 0) {
    // To samtidige kall kan begge finne lista tom. Den andre får eit
    // unikbrot, og det er greitt: lista er der når vi les på nytt.
    await admin
      .from("internal_activities")
      .insert(STANDARD_AKTIVITETAR.map((name, i) => ({ company_id: companyId, name, position: i + 1 })));
    alle = await les();
  }
  return opts.ogsaaInaktive ? alle : alle.filter((a) => a.active);
}

/** Ein aktiv aktivitet hos selskapet, elles null. */
export async function hentAktivitet(
  admin: SupabaseClient,
  companyId: string,
  id: unknown,
): Promise<InternalActivity | null> {
  if (typeof id !== "string" || !id) return null;
  const { data } = await admin
    .from("internal_activities")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("active", true)
    .maybeSingle();
  return (data as InternalActivity | null) ?? null;
}

export type Flyttemaal =
  | { type: "ordre"; orderId: string; priceItemId?: unknown }
  | { type: "intern"; activityId: string };

/**
 * Kva som må endrast på føringa for å flytte ho til målet, eller kvifor det
 * ikkje går. Skriv ingenting sjølv — kallaren slår endringane saman med
 * resten av det som skal lagrast.
 *
 * Til ein ordre: ordren må finnast og ta imot føringar. Kjem føringa frå
 * interntid, har ho ingen timetype, og då må ein veljast. Frå ordre til
 * ordre står timetypen og prisen som dei var.
 *
 * Til interntid: prisen blir 0, og føringa er ikkje fakturerbar.
 */
export async function flytteEndringar(
  admin: SupabaseClient,
  companyId: string,
  entry: Pick<TimeEntry, "order_id" | "internal_activity_id" | "invoice_draft_id">,
  maal: Flyttemaal,
): Promise<{ endringar: Record<string, unknown> } | { feil: string; status: number }> {
  if (entry.invoice_draft_id) return { feil: "Timene er fakturert og kan ikke flyttes.", status: 400 };

  if (maal.type === "intern") {
    const aktivitet = await hentAktivitet(admin, companyId, maal.activityId);
    if (!aktivitet) return { feil: "Fant ikke den interne aktiviteten.", status: 400 };
    return {
      endringar: {
        order_id: null,
        internal_activity_id: aktivitet.id,
        price_item_id: null,
        time_type_name: aktivitet.name,
        unit_price: 0,
        billable: false,
      },
    };
  }

  const { data } = await admin.from("orders").select("*").eq("id", maal.orderId).eq("company_id", companyId).maybeSingle();
  if (!data) return { feil: "Fant ikke ordren.", status: 404 };
  const ordre = data as Order;
  if (ordreErLaast(ordre)) {
    return { feil: `Ordre #${ordre.order_no} er avsluttet og kan ikke føres på.`, status: 400 };
  }

  const endringar: Record<string, unknown> = { order_id: ordre.id, internal_activity_id: null };
  const fraIntern = !entry.order_id;
  if (fraIntern || maal.priceItemId !== undefined) {
    const timetype = await hentTimetype(admin, companyId, maal.priceItemId);
    if (!timetype) {
      return {
        feil: fraIntern ? "Velg en timetype — interntid har ingen pris." : "Ukjent timetype.",
        status: 400,
      };
    }
    endringar.price_item_id = timetype.id;
    endringar.time_type_name = timetype.name;
    endringar.unit_price = timetype.unit_price;
    if (fraIntern) endringar.billable = true;
  }
  return { endringar };
}
