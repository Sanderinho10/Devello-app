import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { finnEllerOpprettKunde } from "@/lib/kunder/koble";
import { lovligeOverganger } from "@/lib/ordre/status";
import { brukereISelskap } from "@/lib/selskap/medlemskap";
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
      Record<Tekstfelt, string | null> & {
        status: OrderStatus;
        customer_id: string | null;
        saksbehandler_id: string | null;
        hovedansvarlig_id: string | null;
      }
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

    // Saksbehandler og hovedansvarlig: en i selskapet, eller null for
    // forslaget (den som opprettet ordren).
    for (const felt of ["saksbehandler_id", "hovedansvarlig_id"] as const) {
      if (body[felt] === undefined) continue;
      const ny = typeof body[felt] === "string" && body[felt] ? body[felt] : null;
      if (ny) {
        const kolleger = await brukereISelskap(admin, session.companyId);
        if (!kolleger.some((k) => k.id === ny)) {
          return NextResponse.json({ error: "Brukeren er ikke med i selskapet." }, { status: 400 });
        }
      }
      if (ny !== naa[felt]) endringer[felt] = ny;
    }

    // Kunden valgt fra registeret: den gjelder, uten å lete på navn og e-post.
    let kundeValgt = false;
    if (typeof body.customer_id === "string" && body.customer_id) {
      const { data: k } = await admin
        .from("customers")
        .select("id")
        .eq("id", body.customer_id)
        .eq("company_id", session.companyId)
        .maybeSingle();
      if (!k) return NextResponse.json({ error: "Fant ikke kunden." }, { status: 400 });
      kundeValgt = true;
      if (k.id !== naa.customer_id) endringer.customer_id = k.id;
      // En leverandør som velges som kunde på en ordre, blir også kunde.
      await admin.from("customers").update({ is_customer: true }).eq("id", k.id).eq("is_customer", false);
    }

    if (Object.keys(endringer).length === 0) {
      return NextResponse.json(naa);
    }

    // Ny kunde på ordren → ny kobling i registeret. Navn eller e-post må
    // ha endret seg; en ny kontaktperson på samme kunde flytter ikke ordren.
    if (!kundeValgt && (endringer.customer_name !== undefined || endringer.customer_email !== undefined)) {
      const kundeId = await finnEllerOpprettKunde(admin, session.companyId, {
        name: (endringer.customer_name as string | undefined) ?? naa.customer_name,
        email: (endringer.customer_email as string | null | undefined) ?? naa.customer_email,
        phone: (endringer.customer_phone as string | null | undefined) ?? naa.customer_phone,
        contact: (endringer.customer_contact as string | null | undefined) ?? naa.customer_contact,
        address: (endringer.site_address as string | null | undefined) ?? naa.site_address,
      });
      if (kundeId !== naa.customer_id) endringer.customer_id = kundeId;
    }

    const { data: oppdatert, error } = await admin
      .from("orders")
      .update(endringer)
      .eq("id", naa.id)
      .eq("company_id", session.companyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Fakturaforslaget følger kunden på ordren — så sant ingen har valgt en
    // annen fakturakunde der (0058), og det ikke alt er overført.
    if (endringer.customer_id !== undefined) {
      const forrige = naa.customer_id;
      let sporring = admin
        .from("invoice_drafts")
        .update({ customer_id: endringer.customer_id, transfer_customer_no: null })
        .eq("order_id", naa.id)
        .neq("status", "overfort");
      sporring = forrige ? sporring.or(`customer_id.is.null,customer_id.eq.${forrige}`) : sporring.is("customer_id", null);
      const { error: fe } = await sporring;
      if (fe) console.error("Kunne ikke flytte fakturaforslaget til ny kunde:", fe.message);
    }

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
