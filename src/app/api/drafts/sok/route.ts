import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Det «Ny ordre» trenger for å vise og velge et tilbud. */
export interface TilbudForslag {
  id: string;
  /** Leadet tilbudet hører til; utkastsiden er /tilbud/leads/<lead_id>. */
  lead_id: string;
  quote_no: number;
  tittel: string;
  kunde: string;
  bekreftet: boolean;
  sendt: boolean;
  /** Ordren som alt er laget fra tilbudet, om noen. */
  ordre: { id: string; order_no: number } | null;
}

/**
 * Søk etter tilbud til «Ny ordre»: på tilbudsnummer, kundenavn eller tittel.
 *
 * Et tall søker på nummeret («100» finner 1002), alt annet på kunde og
 * tittel. De nyeste tilbudene først, åtte treff. Selskapet sjekkes i
 * spørringen via leadet, som i ordre-API-et.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    if (q.length < 1) return NextResponse.json({ tilbud: [] });

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("drafts")
      .select(
        "id, quote_no, confirmed_at, sent_at, tittel:document->>title, kunde:document->customer->>name, leads!inner(id, company_id, subject, from_name)",
      )
      .eq("leads.company_id", session.companyId)
      .not("quote_no", "is", null)
      .order("quote_no", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    type Rad = {
      id: string;
      quote_no: number;
      confirmed_at: string | null;
      sent_at: string | null;
      tittel: string | null;
      kunde: string | null;
      leads: LeadDel | LeadDel[];
    };
    type LeadDel = { id: string; subject: string | null; from_name: string | null };
    const erTal = /^\d+$/.test(q);
    const treff = ((data ?? []) as unknown as Rad[])
      .map((r) => {
        const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
        return {
          id: r.id,
          lead_id: lead?.id ?? "",
          quote_no: r.quote_no,
          tittel: r.tittel || lead?.subject || "(uten tittel)",
          kunde: r.kunde || lead?.from_name || "",
          bekreftet: Boolean(r.confirmed_at),
          sendt: Boolean(r.sent_at),
        };
      })
      .filter((t) =>
        erTal
          ? String(t.quote_no).startsWith(q)
          : t.kunde.toLowerCase().includes(q) || t.tittel.toLowerCase().includes(q),
      )
      .slice(0, 8);

    // Ordre som alt finnes for treffene, så skjemaet kan si det.
    const ordreAv = new Map<string, { id: string; order_no: number }>();
    if (treff.length) {
      const { data: ordrer } = await admin
        .from("orders")
        .select("id, order_no, draft_id")
        .eq("company_id", session.companyId)
        .in(
          "draft_id",
          treff.map((t) => t.id),
        );
      for (const o of ordrer ?? []) if (o.draft_id) ordreAv.set(o.draft_id, { id: o.id, order_no: o.order_no });
    }

    const tilbud: TilbudForslag[] = treff.map((t) => ({ ...t, ordre: ordreAv.get(t.id) ?? null }));
    return NextResponse.json({ tilbud });
  } catch (err) {
    return errorResponse(err);
  }
}
