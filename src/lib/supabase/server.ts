import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv, supabaseAdmin } from "./admin";

// Admin-klienten ligger i admin.ts så scriptene utenfor Next kan bruke den
// uten å dra inn next/headers. Re-eksportert her: ingen av de ~45 filene som
// importerer fra server.ts trenger å vite om det.
export { requireEnv, supabaseAdmin };

/**
 * Supabase-klient for server components og route handlers, med brukerens
 * sesjon. RLS gjelder — alt er avgrenset til brukerens company.
 */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Kall fra en server component — Next tillater ikke cookie-skriving der.
            // Middleware fornyer sesjonen, så dette er trygt å ignorere.
          }
        },
      },
    },
  );
}

/**
 * Klient uten sesjon og uten service role.
 *
 * Brukes til de auth-kallene som SKAL gå som en vanlig, uinnlogget bruker —
 * først og fremst å be Supabase sende en bekreftelseslenke. Service
 * role-klienten kan ikke brukes til det: admin-API-et skriver rett i
 * databasen og sender aldri e-post.
 */
export function supabaseAnon() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface SessionContext {
  userId: string;
  companyId: string;
  email: string;
}

/** Innlogget bruker + hvilket selskap de hører til. Null om ikke innlogget. */
export async function currentSession(): Promise<SessionContext | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("company_id, email")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    companyId: profile.company_id,
    email: profile.email ?? user.email ?? "",
  };
}

/** Som currentSession, men kaster i stedet for å returnere null. For API-ruter. */
export async function requireSession(): Promise<SessionContext> {
  const session = await currentSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Ikke innlogget");
    this.name = "UnauthorizedError";
  }
}
