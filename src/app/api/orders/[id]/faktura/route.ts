import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { ordreOgUtkast } from "@/lib/faktura/api";
import { FakturaFeil, lagFakturaforslag } from "@/lib/faktura/generer";
import { reknOmLinjer, round2 } from "@/lib/faktura/resolver";
import type { InvoiceLine } from "@/lib/faktura/typar";
import { loggFakturaVersjon } from "@/lib/faktura/versjon";
import { tal } from "@/lib/ordre/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Company } from "@/lib/types";

/**
 * POST  — lag (eller lag på nytt) fakturaforslaget for ordren.
 * PATCH — brukerens redigering: linjer, fakturatekst, Deres ref.
 *
 * Redigeringen sender linjene tilbake slik brukeren vil ha dem; koden
 * regner linjesum og totaler på nytt, og merker en endret pris som
 * manuell. Kilder og linjetype kommer aldri fra klienten — de hentes fra
 * linja med samme id i det lagrede utkastet.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;

    const { data: company } = await admin
      .from("companies")
      .select("name, tone_settings")
      .eq("id", session.companyId)
      .single();

    const draft = await lagFakturaforslag(admin, {
      ordre: r.ordre,
      company: (company ?? { name: "", tone_settings: {} }) as Pick<Company, "name" | "tone_settings">,
      userId: session.userId,
    });
    return NextResponse.json(draft);
  } catch (err) {
    if (err instanceof FakturaFeil) return errorResponse(err, err.status);
    return errorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const admin = supabaseAdmin();
    const r = await ordreOgUtkast(admin, session, id);
    if (r instanceof NextResponse) return r;
    if (!r.draft) return NextResponse.json({ error: "Ordren har ikke noe fakturaforslag ennå." }, { status: 404 });
    const draft = r.draft;
    if (draft.status === "overfort") {
      return NextResponse.json({ error: "Forslaget er overført til regnskapssystemet og kan ikke endres." }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      lines?: unknown;
      invoice_text?: unknown;
      customer_reference?: unknown;
    };
    const endringer: Record<string, unknown> = {};

    if (body.invoice_text !== undefined) {
      endringer.invoice_text = typeof body.invoice_text === "string" && body.invoice_text.trim() ? body.invoice_text.trim() : null;
    }
    if (body.customer_reference !== undefined) {
      endringer.customer_reference =
        typeof body.customer_reference === "string" && body.customer_reference.trim() ? body.customer_reference.trim().slice(0, 120) : null;
    }

    if (body.lines !== undefined) {
      if (!Array.isArray(body.lines)) return NextResponse.json({ error: "lines må være en liste." }, { status: 400 });
      const eksisterande = new Map(draft.lines.map((l) => [l.id, l]));
      const nye: InvoiceLine[] = [];
      for (const raa of body.lines as Record<string, unknown>[]) {
        const lid = typeof raa.id === "string" ? raa.id : "";
        const gammal = eksisterande.get(lid);
        const description = typeof raa.description === "string" ? raa.description.trim() : (gammal?.description ?? "");
        if (!description) return NextResponse.json({ error: "En linje mangler beskrivelse." }, { status: 400 });
        const quantity = raa.quantity === undefined ? (gammal?.quantity ?? 0) : tal(raa.quantity);
        if (quantity === null || quantity < 0) return NextResponse.json({ error: `Ugyldig mengde på «${description}».` }, { status: 400 });
        let unit_price: number | null;
        if (raa.unit_price === undefined) unit_price = gammal?.unit_price ?? null;
        else if (raa.unit_price === null || raa.unit_price === "") unit_price = null;
        else {
          unit_price = tal(raa.unit_price);
          if (unit_price === null || unit_price < 0) return NextResponse.json({ error: `Ugyldig pris på «${description}».` }, { status: 400 });
        }
        if (gammal) {
          nye.push({
            ...gammal,
            description,
            quantity,
            unit: typeof raa.unit === "string" && raa.unit.trim() ? raa.unit.trim().slice(0, 12) : gammal.unit,
            unit_price,
            included: raa.included === undefined ? gammal.included : Boolean(raa.included),
          });
        } else {
          // En linje brukeren la til selv: ingen kilder, alltid manuell.
          nye.push({
            id: lid || crypto.randomUUID(),
            kind: "tekst",
            description,
            quantity,
            unit: typeof raa.unit === "string" && raa.unit.trim() ? raa.unit.trim().slice(0, 12) : "stk",
            unit_price,
            unit_price_manual: unit_price !== null,
            line_total: 0,
            vat_pct: draft.lines[0]?.vat_pct ?? 25,
            included: raa.included === undefined ? true : Boolean(raa.included),
            sources: [],
            ai_reason: null,
          });
        }
      }
      const om = reknOmLinjer(nye, draft.lines);
      endringer.lines = om.lines;
      endringer.totals = om.totals;
    }

    if (Object.keys(endringer).length === 0) return NextResponse.json(draft);

    // En redigering av et godkjent forslag trekker godkjenningen: det som
    // ble godkjent er ikke lenger det som ligger der.
    if (draft.status === "godkjent" || draft.status === "feil") {
      endringer.status = "utkast";
      endringer.approved_by = null;
      endringer.approved_at = null;
      endringer.transfer_error = null;
    }

    const { data, error } = await admin
      .from("invoice_drafts")
      .update(endringer)
      .eq("id", draft.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const lagra = data as typeof draft;
    await loggFakturaVersjon(admin, {
      draftId: draft.id,
      source: "redigering",
      snapshot: { lines: lagra.lines, totals: lagra.totals, invoice_text: lagra.invoice_text },
      previous: { lines: draft.lines, totals: draft.totals, invoice_text: draft.invoice_text },
      userId: session.userId,
    });

    return NextResponse.json({ ...lagra, totals: { ...lagra.totals, total: round2(lagra.totals.total) } });
  } catch (err) {
    return errorResponse(err);
  }
}
