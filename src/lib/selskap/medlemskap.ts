import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types";

/**
 * En bruker kan være med i flere selskap (company_memberships, 0056).
 *
 * users.company_id er selskapet brukeren står i nå, og users.role rollen
 * der. RLS og alle sjekker leser dem som før. Å bytte selskap er å flytte
 * pekeren — bare til et selskap brukeren har medlemskap i.
 */

export interface MittSelskap {
  id: string;
  name: string;
  role: UserRole;
}

/** Selskapene brukeren er med i, sortert på navn. */
export async function mineSelskap(admin: SupabaseClient, userId: string): Promise<MittSelskap[]> {
  const { data, error } = await admin
    .from("company_memberships")
    .select("role, companies!inner(id, name)")
    .eq("user_id", userId);
  // Før migrasjon 0056 finnes ikke tabellen. Da er svaret «bare der du står».
  if (error) return [];
  return (data ?? [])
    .map((r) => {
      const c = r.companies as unknown as { id: string; name: string } | { id: string; name: string }[];
      const selskap = Array.isArray(c) ? c[0] : c;
      return { id: selskap.id, name: selskap.name, role: r.role as UserRole };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

/**
 * Bytt selskapet brukeren står i. Feiler om medlemskapet ikke finnes —
 * en id fra klienten er aldri nok alene.
 */
export async function byttSelskap(admin: SupabaseClient, userId: string, companyId: string): Promise<MittSelskap> {
  const { data: m } = await admin
    .from("company_memberships")
    .select("role, companies!inner(id, name)")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!m) throw new Error("Du har ikke tilgang til det selskapet.");

  const { error } = await admin.from("users").update({ company_id: companyId, role: m.role }).eq("id", userId);
  if (error) throw new Error(error.message);

  const c = m.companies as unknown as { id: string; name: string } | { id: string; name: string }[];
  const selskap = Array.isArray(c) ? c[0] : c;
  return { id: selskap.id, name: selskap.name, role: m.role as UserRole };
}

/** Legg brukeren til i et selskap, eller oppdater rollen om de alt er med. */
export async function leggTilMedlemskap(
  admin: SupabaseClient,
  input: { userId: string; companyId: string; role: UserRole },
): Promise<void> {
  const { error } = await admin
    .from("company_memberships")
    .upsert({ user_id: input.userId, company_id: input.companyId, role: input.role }, { onConflict: "user_id,company_id" });
  if (error) throw new Error(error.message);
}

export interface Kollega {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
}

/**
 * Alle med medlemskap i selskapet — også de som akkurat nå står i et annet.
 * Brukes der timer, notater og fakturaer skal vise hvem som førte dem.
 */
export async function brukereISelskap(client: SupabaseClient, companyId: string): Promise<Kollega[]> {
  const { data, error } = await client
    .from("company_memberships")
    .select("role, users!inner(id, full_name, email)")
    .eq("company_id", companyId);
  if (error) {
    // Før migrasjon 0056: brukerne som står i selskapet.
    const { data: gamle } = await client.from("users").select("id, full_name, email, role").eq("company_id", companyId);
    return (gamle ?? []) as Kollega[];
  }
  return (data ?? []).map((r) => {
    const u = r.users as unknown as { id: string; full_name: string | null; email: string } | { id: string; full_name: string | null; email: string }[];
    const bruker = Array.isArray(u) ? u[0] : u;
    return { id: bruker.id, full_name: bruker.full_name, email: bruker.email, role: r.role as UserRole };
  });
}

/**
 * Finnes det alt en Devello-bruker på adressen, med tilhørighet i et annet
 * selskap enn `companyId`? Da er personen en eksisterende bruker som skal
 * legges til, ikke en ny som skal velge passord.
 *
 * En helt ny invitert kan også ha en users-rad: triggeren i 0010 lager den
 * når Supabase sin invitasjonsmail oppretter auth-brukeren. Men den raden
 * peker på det inviterende selskapet, så den teller ikke her.
 */
export async function harBrukerIAnnetSelskap(admin: SupabaseClient, email: string, companyId: string): Promise<boolean> {
  const { data: finst } = await admin.from("users").select("id, company_id").ilike("email", email.trim()).maybeSingle();
  if (!finst) return false;
  if (finst.company_id && finst.company_id !== companyId) return true;
  const andre = (await mineSelskap(admin, finst.id as string)).filter((s) => s.id !== companyId);
  return andre.length > 0;
}

/** Har brukeren med denne adressen alt medlemskap i selskapet? */
export async function erMedlem(admin: SupabaseClient, email: string, companyId: string): Promise<boolean> {
  const { data: finst } = await admin.from("users").select("id, company_id").ilike("email", email.trim()).maybeSingle();
  if (!finst) return false;
  if (finst.company_id === companyId) {
    // Før 0056 er users.company_id hele svaret. Etterpå kan raden være en
    // ny invitert fra triggeren — da er medlemskapet det som avgjør.
    const { data: m, error } = await admin
      .from("company_memberships")
      .select("user_id")
      .eq("user_id", finst.id)
      .eq("company_id", companyId)
      .maybeSingle();
    return error ? true : Boolean(m);
  }
  return (await mineSelskap(admin, finst.id as string)).some((s) => s.id === companyId);
}
