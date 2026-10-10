import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuoteDocument } from "@/lib/types";

/**
 * Kobler tilbud og ordrer til kunderegisteret.
 *
 * Registeret fylles av seg selv: første gang et navn eller en e-post dukker
 * opp i et tilbud eller på en ordre, blir det en kunde. Treffet skjer i
 * databasen (finn_eller_opprett_kunde, 0049) så to samtidige ordrer på samme
 * kunde ikke gir to kunder. E-post er nøkkelen; navn bare når den vi har med
 * samme navn mangler e-post.
 *
 * Kallet er aldri en betingelse. Feiler det, lagres tilbudet eller ordren
 * uten kunde — registeret er en oversikt, ikke en sperre.
 */
export interface Kundefelt {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  contact?: string | null;
  address?: string | null;
}

export async function finnEllerOpprettKunde(
  admin: SupabaseClient,
  companyId: string,
  felt: Kundefelt,
): Promise<string | null> {
  const name = tekst(felt.name);
  const email = tekst(felt.email);
  if (!name && !email) return null;

  const { data, error } = await admin.rpc("finn_eller_opprett_kunde", {
    p_company: companyId,
    p_name: name || null,
    p_email: email || null,
    p_phone: tekst(felt.phone) || null,
    p_contact: tekst(felt.contact) || null,
    p_address: tekst(felt.address) || null,
  });
  if (error) {
    console.error("Kunne ikke koble kunde:", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}

/**
 * Kundefeltene et lead gir: tilbudsdokumentet først — det er redigert av et
 * menneske — og avsenderen på e-posten som reserve.
 */
export function kundefeltFraLead(
  lead: { from_name: string | null; from_email: string | null },
  document: QuoteDocument | null | undefined,
): Kundefelt {
  const k = document?.customer;
  return {
    name: tekst(k?.name) || lead.from_name,
    email: tekst(k?.email) || lead.from_email,
    phone: k?.phone ?? null,
    contact: k?.contact ?? null,
    address: k?.address ?? null,
  };
}

/** Kobler leadet til kunden og returnerer id-en, eller null når det ikke var noe å kjenne kunden på. */
export async function kobleLeadTilKunde(
  admin: SupabaseClient,
  companyId: string,
  lead: { id: string; from_name: string | null; from_email: string | null },
  document: QuoteDocument | null | undefined,
): Promise<string | null> {
  const kundeId = await finnEllerOpprettKunde(admin, companyId, kundefeltFraLead(lead, document));
  if (kundeId) {
    await admin
      .from("leads")
      .update({ customer_id: kundeId })
      .eq("id", lead.id)
      .eq("company_id", companyId);
  }
  return kundeId;
}

function tekst(verdi: unknown): string {
  return typeof verdi === "string" ? verdi.trim() : "";
}
