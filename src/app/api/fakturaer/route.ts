import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { kundefeltFra } from "@/lib/faktura/handlingar";
import { ordreModulEllers403 } from "@/lib/ordre/tilgang";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

/**
 * POST — ny faktura rett i fakturafanen, uten ordre (0065).
 *
 * Body: { title?, customer_id?, customer_name?, customer_contact?,
 * customer_email?, customer_phone?, customer_address? }. Med customer_id
 * fylles tomme felt fra kontaktkortet. Fakturaen starter som et tomt
 * utkast; linjene skrives i fakturaen etterpå.
 *
 * En faktura fra en ordre lages ikke her, men fra ordrens fakturafane —
 * forslaget bygger på det som er ført på jobben.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const admin = supabaseAdmin();
    const avvist = await ordreModulEllers403(admin, session.companyId);
    if (avvist) return avvist;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const tekst = (v: unknown, maks = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, maks) : null);

    let felt = {
      customer_name: tekst(body.customer_name),
      customer_contact: tekst(body.customer_contact),
      customer_email: tekst(body.customer_email),
      customer_phone: tekst(body.customer_phone, 40),
      customer_address: tekst(body.customer_address, 300),
    };

    let customerId: string | null = null;
    if (typeof body.customer_id === "string" && body.customer_id) {
      const { data } = await admin
        .from("customers")
        .select("*")
        .eq("id", body.customer_id)
        .eq("company_id", session.companyId)
        .maybeSingle();
      if (!data) return NextResponse.json({ error: "Fant ikke kunden." }, { status: 400 });
      customerId = data.id as string;
      // Det som står i skjemaet går foran kontaktkortet; tomme felt fylles derfra.
      const fraKort = kundefeltFra(data as Customer);
      felt = {
        customer_name: felt.customer_name ?? fraKort.customer_name,
        customer_contact: felt.customer_contact ?? fraKort.customer_contact,
        customer_email: felt.customer_email ?? fraKort.customer_email,
        customer_phone: felt.customer_phone ?? fraKort.customer_phone,
        customer_address: felt.customer_address ?? fraKort.customer_address,
      };
    }
    if (!felt.customer_name) return NextResponse.json({ error: "Velg eller skriv inn en kunde." }, { status: 400 });

    const { data, error } = await admin
      .from("invoice_drafts")
      .insert({
        company_id: session.companyId,
        order_id: null,
        customer_id: customerId,
        ...felt,
        title: tekst(body.title),
        status: "utkast",
        strategy: "manuell",
        lines: [],
        totals: { subtotal: 0, vat: 0, total: 0 },
        invoice_text: null,
        customer_reference: felt.customer_contact,
        notes: [],
        questions: [],
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
