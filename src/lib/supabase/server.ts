import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
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

/**
 * RLS-klienten for et API-kall: bearer-token fra montørappen om det finnes,
 * ellers cookie-sesjonen fra nettleseren.
 *
 * Appen logger inn med Supabase Auth direkte og sender
 * `Authorization: Bearer <access_token>`. Tokenet er Supabase sitt eget
 * JWT — ingen egen auth-ordning. Klienten under går med anon key og
 * tokenet i headeren, så RLS gjelder som for cookie-klienten.
 *
 * Feil header (ikke «Bearer », tomt token) behandles som ikke innlogget,
 * ikke som feil — og tokenet logges aldri.
 */
export async function supabaseForRequest(): Promise<{ client: SupabaseClient; bearer: string | null }> {
  let bearer: string | null = null;
  try {
    const auth = (await headers()).get("authorization") ?? "";
    if (/^Bearer\s+\S+$/i.test(auth)) bearer = auth.replace(/^Bearer\s+/i, "").trim();
  } catch {
    // Utenfor en request (build, script) finnes ingen headers.
  }
  if (!bearer) return { client: await supabaseServer(), bearer: null };

  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return { client, bearer };
}

export interface SessionContext {
  userId: string;
  companyId: string;
  email: string;
  /** Hvordan kallet var innlogget: nettappen (cookie) eller montørappen (bearer). */
  via: "cookie" | "bearer";
}

/** Innlogget bruker + hvilket selskap de hører til. Null om ikke innlogget. */
export async function currentSession(): Promise<SessionContext | null> {
  const { client: supabase, bearer } = await supabaseForRequest();
  let user: { id: string; email?: string } | null = null;
  try {
    const { data } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }
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
    via: bearer ? "bearer" : "cookie",
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
