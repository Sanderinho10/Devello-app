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
  /** Resten av adressen hver for seg, når skjemaet har dem (0053). */
  address2?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

export async function finnEllerOpprettKunde(
  admin: SupabaseClient,
  companyId: string,
  felt: Kundefelt,
): Promise<string | null> {
  const name = tekst(felt.name);
  const email = tekst(felt.email);
  if (!name && !email) return null;

  const grunn = {
    p_company: companyId,
    p_name: name || null,
    p_email: email || null,
    p_phone: tekst(felt.phone) || null,
    p_contact: tekst(felt.contact) || null,
    p_address: tekst(felt.address) || null,
  };
  const delt = {
    p_address2: tekst(felt.address2) || null,
    p_postal_code: tekst(felt.postal_code) || null,
    p_city: tekst(felt.city) || null,
  };
  const harDelt = Object.values(delt).some(Boolean);
  let { data, error } = await admin.rpc("finn_eller_opprett_kunde", harDelt ? { ...grunn, ...delt } : grunn);
  // Før 0053 er kjørt, kjenner ikke databasen de nye parameterne. Da kobles
  // kunden som før, med adressen på én linje, heller enn ikke i det hele tatt.
  if (error && harDelt) {
    console.warn("finn_eller_opprett_kunde uten adressefelt (0053 ikke kjørt?):", error.message);
    const poststed = [delt.p_postal_code, delt.p_city].filter(Boolean).join(" ");
    ({ data, error } = await admin.rpc("finn_eller_opprett_kunde", {
      ...grunn,
      p_address: [grunn.p_address, delt.p_address2, poststed].filter(Boolean).join(", ") || null,
    }));
  }
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

/**
 * Kundenummeret til kunden et lead er koblet til, eller null. Til PDF-en og
 * tilbudssiden. Feiler aldri — uten nummer står bare raden ikke der.
 */
export async function kundenummerForLead(admin: SupabaseClient, leadId: string): Promise<number | null> {
  try {
    const { data } = await admin.from("leads").select("customers(customer_no)").eq("id", leadId).maybeSingle();
    const k = data?.customers as unknown as { customer_no: number | null } | { customer_no: number | null }[] | null;
    const kunde = Array.isArray(k) ? k[0] : k;
    return kunde?.customer_no ?? null;
  } catch {
    return null;
  }
}
