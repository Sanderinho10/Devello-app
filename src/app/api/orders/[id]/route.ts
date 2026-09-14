import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { lovligeOverganger } from "@/lib/ordre/status";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ORDER_STATUS_LABELS, type Order, type OrderStatus } from "@/lib/types";

const TEKSTFELT = [
  "title",
  "description",
  "customer_name",
  "customer_contact",
  "customer_email",
  "customer_phone",
  "site_address",
] as const;

type Tekstfelt = (typeof TEKSTFELT)[number];

/**
 * Oppdaterer status, beskrivelse eller kundefelt på en ordre.
 *
 * Hver statusendring havner i hendelsesloggen. Endres beskrivelsen, blir
 * den merket som skrevet manuelt — agentens versjon er bare et utkast, og
 * det skal være synlig når et menneske har tatt over.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();

    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data: order } = await admin
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("company_id", session.companyId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ error: "Fant ikke ordren" }, { status: 404 });
    }
    const naa = order as Order;

    const body = (await request.json().catch(() => ({}))) as Partial<
      Record<Tekstfelt, string | null> & { status: OrderStatus }
    >;

    const endringer: Record<string, unknown> = {};
    const hendelser: { kind: string; note: string }[] = [];

    if (body.status !== undefined && body.status !== naa.status) {
      const til = body.status;
      if (til === "fakturert") {
        return NextResponse.json(
          { error: "Fakturering kommer i et senere steg." },
          { status: 400 },
        );
      }
      if (!lovligeOverganger(naa.status).includes(til)) {
        return NextResponse.json(
          {
            error: `Kan ikke gå fra ${ORDER_STATUS_LABELS[naa.status] ?? naa.status} til ${
              ORDER_STATUS_LABELS[til] ?? til
            }.`,
          },
          { status: 400 },
        );
      }
      endringer.status = til;
      endringer.closed_at =
        til === "ferdig" || til === "avbrutt" ? new Date().toISOString() : null;
      hendelser.push({ kind: "status", note: `${naa.status} → ${til}` });
    }

    for (const felt of TEKSTFELT) {
      if (body[felt] === undefined) continue;
      const verdi = typeof body[felt] === "string" ? body[felt]!.trim() : "";
      if (felt === "title") {
        if (!verdi) {
          return NextResponse.json({ error: "Ordren må ha en tittel." }, { status: 400 });
        }
        if (verdi !== naa.title) endringer.title = verdi;
      } else if (felt === "customer_name") {
        if (verdi !== naa.customer_name) endringer.customer_name = verdi;
      } else if (felt === "description") {
        const ny = verdi || null;
        if (ny !== naa.description) {
          endringer.description = ny;
          endringer.description_source = ny ? "manuell" : null;
        }
      } else if ((verdi || null) !== naa[felt]) {
        endringer[felt] = verdi || null;
      }
    }

    if (Object.keys(endringer).length === 0) {
      return NextResponse.json(naa);
    }

    const { data: oppdatert, error } = await admin
      .from("orders")
      .update(endringer)
      .eq("id", naa.id)
      .eq("company_id", session.companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (hendelser.length) {
      await admin.from("order_events").insert(
        hendelser.map((h) => ({
          order_id: naa.id,
          kind: h.kind,
          note: h.note,
          created_by: session.userId,
        })),
      );
    }

    return NextResponse.json(oppdatert);
  } catch (err) {
    return errorResponse(err);
  }
}
