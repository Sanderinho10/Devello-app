import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import { KUNDENUMMER_I_BRUK, UGYLDIG_KUNDENUMMER, erKundenummerKonflikt, lesKontakt, lesKundenummer } from "@/lib/kunder/felt";
import { adresseTekst, hovedadresse } from "@/lib/kunder/adresse";

/**
 * Søk i kontaktregisteret, til forslagene i kundefeltene i skjemaene. Treff
 * på navn, e-post, kontaktperson, telefon og kundenummer; de åtte beste. Rene leverandører
 * er med — velges en til et tilbud eller en ordre, blir den også kunde (se
 * finn_eller_opprett_kunde, 0050). Uten søkeord: ingen treff — en liste over
 * alle kontakter er /kontakter, ikke dette.
 */
export async function GET(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    // «liste=1»: nedtrekkslista i skjemaene åpnes før man har skrevet noe,
    // som i Go. Da kommer kundene alfabetisk; ellers kreves to tegn.
    const liste = request.nextUrl.searchParams.get("liste") === "1";
    if (q.length < 2 && !liste) return NextResponse.json({ kunder: [] });

    const admin = supabaseAdmin();
    let sporring = admin
      .from("customers")
      .select("*")
      .eq("company_id", session.companyId)
      .order("name")
      .limit(q.length < 2 ? 20 : 8);
    if (q.length >= 2) {
      // PostgREST-filteret skiller på komma og parenteser; de har ingen plass
      // i et søkeord uansett.
      const monster = `%${q.replace(/[%_,()]/g, " ")}%`;
      const nummer = /^\d{1,9}$/.test(q) ? `,customer_no.eq.${q}` : "";
      sporring = sporring.or(
        `name.ilike.${monster},email.ilike.${monster},contact.ilike.${monster},phone.ilike.${monster}${nummer}`,
      );
    }
    const { data, error } = await sporring;
    if (error) throw new Error(error.message);
    // «address» er kundens hovedadresse. Hvor en jobb gjøres hører til
    // ordren, ikke kunden — skjemaene har en egen avkryssing for det.
    const kunder = ((data ?? []) as Customer[]).map((k) => ({
      id: k.id,
      name: k.name,
      customer_no: k.customer_no,
      contact: k.contact,
      email: k.email,
      phone: k.phone,
      address: adresseTekst(hovedadresse(k)) || null,
      adresse: hovedadresse(k),
      kode: k.accounting_customer_no,
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
    const kundenr = lesKundenummer(body);
    if (kundenr === "ugyldig") return NextResponse.json({ error: UGYLDIG_KUNDENUMMER }, { status: 400 });
    const is_customer = felt.is_customer ?? !felt.is_supplier;
    const is_supplier = felt.is_supplier ?? false;
    if (!is_customer && !is_supplier) {
      return NextResponse.json({ error: "Kryss av for kunde, leverandør eller begge." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("customers")
      .insert({
        ...felt,
        ...(kundenr !== undefined ? { customer_no: kundenr } : {}),
        is_customer,
        is_supplier,
        company_id: session.companyId,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        if (erKundenummerKonflikt(error)) return NextResponse.json({ error: KUNDENUMMER_I_BRUK }, { status: 409 });
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
