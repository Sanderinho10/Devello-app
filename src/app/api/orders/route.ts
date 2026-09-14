import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { harModul } from "@/lib/moduler";
import { lagOrdreBeskrivelse } from "@/lib/ordre/beskrivelse";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  computeTotals,
  type Draft,
  type Lead,
  type OrderQuoteSnapshot,
  type QuoteDocument,
  type QuoteType,
  type ToneSettings,
} from "@/lib/types";

/**
 * Oppretter en ordre — fra et bekreftet tilbud, eller uten tilbud.
 *
 * Fra tilbud: kunde, adresse og tittel hentes fra tilbudsdokumentet, og
 * dokumentet fryses som grunnlag på ordren. Tilbudet kan redigeres videre
 * etterpå; ordren skal vise det kunden sa ja til. Én ordre per tilbud —
 * finnes den, svarer vi med den som er der. To faner og to klikk skal gi
 * samme ordre, ikke to.
 *
 * Uten tilbud: en servicejobb som kom på telefon. Bare tittelen er påkrevd.
 *
 * Beskrivelsen skrives av den lille modellen når ordren kommer fra et
 * tilbud. Den er et første utkast og aldri en betingelse: feiler kallet,
 * opprettes ordren uten.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();

    const { data: company } = await admin
      .from("companies")
      .select("moduler, tone_settings")
      .eq("id", session.companyId)
      .single();

    if (!harModul(company?.moduler, "ordre")) {
      return NextResponse.json(
        { error: "Ordre-modulen er ikke aktivert for dette selskapet." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      draft_id?: string;
      title?: string;
      customer_name?: string;
      customer_contact?: string;
      customer_email?: string;
      customer_phone?: string;
      site_address?: string;
    };

    let felt: {
      title: string;
      customer_name: string;
      customer_contact: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      site_address: string | null;
      lead_id: string | null;
      draft_id: string | null;
      quote_type: QuoteType | null;
      quote_snapshot: OrderQuoteSnapshot | null;
      planned_total: number | null;
    };

    let lead: Lead | null = null;
    let draft: Draft | null = null;

    if (body.draft_id) {
      // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
      const { data } = await admin
        .from("drafts")
        .select("*, leads!inner(*)")
        .eq("id", body.draft_id)
        .eq("leads.company_id", session.companyId)
        .maybeSingle();

      if (!data) {
        return NextResponse.json({ error: "Fant ikke utkastet" }, { status: 404 });
      }
      if (!data.confirmed_at) {
        return NextResponse.json(
          { error: "Bekreft tilbudet før du oppretter ordre." },
          { status: 400 },
        );
      }

      const eksisterende = await finnOrdreForUtkast(admin, data.id);
      if (eksisterende) {
        return NextResponse.json({ ...eksisterende, existed: true });
      }

      lead = data.leads as unknown as Lead;
      draft = data as unknown as Draft;
      const document = draft.document as QuoteDocument | null;
      const kunde = document?.customer;
      const totals = document ? computeTotals(document) : null;

      felt = {
        title: tekst(document?.title) || tekst(lead.subject) || "Ordre",
        customer_name: tekst(kunde?.name) || tekst(lead.from_name) || "",
        customer_contact: tekst(kunde?.contact) || null,
        customer_email: tekst(kunde?.email) || tekst(lead.from_email) || null,
        customer_phone: tekst(kunde?.phone) || null,
        site_address: tekst(kunde?.address) || null,
        lead_id: lead.id,
        draft_id: draft.id,
        quote_type: draft.quote_type,
        quote_snapshot: { quote_type: draft.quote_type, document, totals },
        planned_total: totals?.subtotal ?? null,
      };
    } else {
      const title = tekst(body.title);
      if (!title) {
        return NextResponse.json({ error: "Ordren må ha en tittel." }, { status: 400 });
      }
      felt = {
        title,
        customer_name: tekst(body.customer_name),
        customer_contact: tekst(body.customer_contact) || null,
        customer_email: tekst(body.customer_email) || null,
        customer_phone: tekst(body.customer_phone) || null,
        site_address: tekst(body.site_address) || null,
        lead_id: null,
        draft_id: null,
        quote_type: null,
        quote_snapshot: null,
        planned_total: null,
      };
    }

    // Løpenummeret deles ut atomisk i databasen. Et «max + 1» her ville gitt
    // to ordrer samme nummer når to montører oppretter samtidig.
    const { data: orderNo, error: nrFeil } = await admin.rpc("neste_ordrenummer", {
      p_company: session.companyId,
    });
    if (nrFeil || typeof orderNo !== "number") {
      throw new Error(nrFeil?.message ?? "Fikk ikke ordrenummer.");
    }

    const { data: order, error: insertFeil } = await admin
      .from("orders")
      .insert({
        ...felt,
        company_id: session.companyId,
        order_no: orderNo,
        created_by: session.userId,
      })
      .select("id, order_no")
      .single();

    if (insertFeil) {
      // 23505 på orders_ein_per_draft: noen andre rakk å opprette ordren
      // for dette tilbudet mellom sjekken over og innsettingen. Svaret er
      // det samme som om den fantes fra før.
      if (insertFeil.code === "23505" && felt.draft_id) {
        const eksisterende = await finnOrdreForUtkast(admin, felt.draft_id);
        if (eksisterende) return NextResponse.json({ ...eksisterende, existed: true });
      }
      throw new Error(insertFeil.message);
    }

    await admin.from("order_events").insert({
      order_id: order.id,
      kind: "oppretta",
      note: felt.draft_id ? "Fra tilbud" : "Manuelt",
      created_by: session.userId,
    });

    // Beskrivelsen kommer etter at ordren er lagret, så en treg modell aldri
    // holder ordrenummeret tilbake — og aldri kan velte opprettingen.
    if (lead && draft) {
      const maalform = ((company?.tone_settings ?? {}) as ToneSettings).maalform ?? "nb";
      const beskrivelse = await lagOrdreBeskrivelse({
        lead,
        draft,
        maalform,
        companyId: session.companyId,
      });
      if (beskrivelse) {
        await admin
          .from("orders")
          .update({ description: beskrivelse, description_source: "ai" })
          .eq("id", order.id);
      }
    }

    return NextResponse.json({ id: order.id, order_no: order.order_no }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

async function finnOrdreForUtkast(
  admin: ReturnType<typeof supabaseAdmin>,
  draftId: string,
): Promise<{ id: string; order_no: number } | null> {
  const { data } = await admin
    .from("orders")
    .select("id, order_no")
    .eq("draft_id", draftId)
    .maybeSingle();
  return data ?? null;
}

function tekst(verdi: unknown): string {
  return typeof verdi === "string" ? verdi.trim() : "";
}
