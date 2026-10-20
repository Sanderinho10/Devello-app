import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import { lesKontakt } from "@/lib/kunder/felt";
import { adresseTekst, oppdragsadresse } from "@/lib/kunder/adresse";

/**
 * Søk i kontaktregisteret, til forslagene i kundefeltene i skjemaene. Treff
 * på navn, e-post, kontaktperson og telefon; de åtte beste. Rene leverandører
 * er med — velges en til et tilbud eller en ordre, blir den også kunde (se
 * finn_eller_opprett_kunde, 0050). Uten søkeord: ingen treff — en liste over
 * alle kontakter er /kontakter, ikke dette.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ kunder: [] });

    // PostgREST-filteret skiller på komma og parenteser; de har ingen plass
    // i et søkeord uansett.
    const monster = `%${q.replace(/[%_,()]/g, " ")}%`;
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("customers")
      .select("*")
      .eq("company_id", session.companyId)
      .or(
        `name.ilike.${monster},email.ilike.${monster},contact.ilike.${monster},phone.ilike.${monster}`,
      )
      .order("name")
      .limit(8);
    if (error) throw new Error(error.message);
    // Skjemaene fyller ut stedet for jobben med «address»: det er
    // oppdragsadressen, som er hovedadressen når det ikke er krysset av for
    // en egen.
    const kunder = ((data ?? []) as Customer[]).map((k) => ({
      id: k.id,
      name: k.name,
      contact: k.contact,
      email: k.email,
      phone: k.phone,
      address: adresseTekst(oppdragsadresse(k)) || null,
      is_customer: k.is_customer,
      is_supplier: k.is_supplier,
    }));
    return NextResponse.json({ kunder });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Oppretter en kontakt for hånd.
 *
 * De fleste kundene oppstår av seg selv fra tilbud og ordrer; dette er for
 * leverandører og for den som vil ha kunden inn før første jobb. Navnet er
 * påkrevd, og kontakten må være kunde, leverandør eller begge — sendes ingen
 * av dem, er den kunde. En e-post som alt finnes på en annen kontakt avvises
 * — én adresse er én kontakt.
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const felt = lesKontakt(body);
    if (!felt.name) {
      return NextResponse.json({ error: "Kontakten må ha et navn." }, { status: 400 });
    }
    const is_customer = felt.is_customer ?? !felt.is_supplier;
    const is_supplier = felt.is_supplier ?? false;
    if (!is_customer && !is_supplier) {
      return NextResponse.json({ error: "Kryss av for kunde, leverandør eller begge." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("customers")
      .insert({ ...felt, is_customer, is_supplier, company_id: session.companyId })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Det finnes allerede en kontakt med denne e-postadressen." },
          { status: 409 },
        );
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
