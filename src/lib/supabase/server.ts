import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase-klient for server components og route handlers, med brukaren sin
 * sesjon. RLS gjeld — alt er scoped til brukaren sitt company.
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
            // Kall frå ein server component — Next tillèt ikkje cookie-skriving der.
            // Middleware fornyar sesjonen, så dette er trygt å ignorere.
          }
        },
      },
    },
  );
}

/**
 * Service role-klient. Omgår RLS — brukast berre der vi må røre tokens eller
 * skrive på vegner av agenten. Kvar bruk må sjølv sjekke company-tilhøyre.
 */
export function supabaseAdmin() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Manglar miljøvariabel ${name}. Sjå .env.example og README for oppsett.`,
    );
  }
  return value;
}

export interface SessionContext {
  userId: string;
  companyId: string;
  email: string;
}

/** Innlogga brukar + kva selskap dei høyrer til. Null om ikkje innlogga. */
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

/** Som currentSession, men kastar i staden for å returnere null. For API-ruter. */
export async function requireSession(): Promise<SessionContext> {
  const session = await currentSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Ikkje innlogga");
    this.name = "UnauthorizedError";
  }
}
