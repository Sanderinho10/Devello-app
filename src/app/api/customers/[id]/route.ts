import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { KUNDENUMMER_I_BRUK, UGYLDIG_KUNDENUMMER, erKundenummerKonflikt, lesKontakt, lesKundenummer } from "@/lib/kunder/felt";

/**
 * Oppdaterer kontaktkortet. Bare feltene som sendes endres.
 *
 * Endringer her rører ikke tilbud eller ordrer: kundefeltene der er
 * dokumentets og ordrens egne, og skal vise det som gjaldt da. Det gjelder
 * også kunde/leverandør-avkryssingen: overføringen til PowerOffice Go leser
 * ordrens kundefelt, ikke registeret, så en kontakt som slutter å være kunde
 * her stopper ingen faktura.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const felt: Record<string, unknown> = lesKontakt(body);
    // Kundenummeret i Go settes bare av overføringen. Herfra kan det bare
    // fjernes — da letes kunden opp på nytt neste gang.
    if (body.accounting_customer_no === null) {
      felt.accounting_customer_no = null;
      felt.accounting_connection_id = null;
    }
    // Kundenummeret kan rettes, men ikke fjernes: tomt betyr «la det stå».
    const kundenr = lesKundenummer(body);
    if (kundenr === "ugyldig") return NextResponse.json({ error: UGYLDIG_KUNDENUMMER }, { status: 400 });
    if (kundenr !== undefined) felt.customer_no = kundenr;
    if (felt.name !== undefined && !felt.name) {
      return NextResponse.json({ error: "Kontakten må ha et navn." }, { status: 400 });
    }
    if (felt.is_customer === false && felt.is_supplier === false) {
      return NextResponse.json({ error: "Kryss av for kunde, leverandør eller begge." }, { status: 400 });
    }
    if (Object.keys(felt).length === 0) {
      return NextResponse.json({ error: "Ingenting å endre." }, { status: 400 });
    }

    const admin = supabaseAdmin();
    // Tilgangssjekken ligger i spørringen, ikke i en etterkontroll.
    const { data, error } = await admin
      .from("customers")
      .update(felt)
      .eq("id", id)
      .eq("company_id", session.companyId)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        if (erKundenummerKonflikt(error)) return NextResponse.json({ error: KUNDENUMMER_I_BRUK }, { status: 409 });
        return NextResponse.json(
          { error: "Det finnes allerede en kontakt med denne e-postadressen." },
          { status: 409 },
        );
      }
      // customers_kunde_eller_leverandor: bare den ene avkryssingen ble sendt,
      // og den andre var alt av.
      if (error.code === "23514") {
        return NextResponse.json({ error: "Kryss av for kunde, leverandør eller begge." }, { status: 400 });
      }
      throw new Error(error.message);
    }
    if (!data) return NextResponse.json({ error: "Fant ikke kontakten" }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
