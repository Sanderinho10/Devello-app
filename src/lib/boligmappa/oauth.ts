import { requireEnv } from "@/lib/supabase/admin";

/**
 * OAuth 2.0 authorization code mot Boligmappa Proff — same form som
 * Microsoft-flyten: brukeren (kundens Boligmappa Bedrift-bruker) logger inn
 * hos Boligmappa, vi får en kode, bytter den i tokens og lagrer dem bak
 * service role. Client id og secret er Devello sine; redirect-URI-en må
 * være registrert hos Boligmappa.
 */

export type BoligmappaMiljo = "production" | "staging";

export function boligmappaMiljo(): BoligmappaMiljo {
  return process.env.BOLIGMAPPA_ENV === "staging" ? "staging" : "production";
}

export function boligmappaUrlar(miljo: BoligmappaMiljo = boligmappaMiljo()): { api: string; auth: string } {
  return miljo === "staging"
    ? {
        api: "https://staging-proff-api.boligmappa.no/v1",
        auth: "https://testauth.boligmappa.no/auth/realms/professional-realm-staging/protocol/openid-connect",
      }
    : {
        api: "https://proff-api.boligmappa.no/v1",
        auth: "https://auth.boligmappa.no/auth/realms/professional-realm/protocol/openid-connect",
      };
}

export function redirectUri(): string {
  return (
    process.env.BOLIGMAPPA_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/boligmappa/auth/callback`
  );
}

export function buildBoligmappaAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("BOLIGMAPPA_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid offline_access",
    state,
  });
  return `${boligmappaUrlar().auth}/auth?${params.toString()}`;
}

export interface BoligmappaTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

export async function exchangeBoligmappaCode(code: string): Promise<BoligmappaTokens> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
}

export async function refreshBoligmappaTokens(refreshToken: string): Promise<BoligmappaTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function tokenRequest(extra: Record<string, string>): Promise<BoligmappaTokens> {
  const body = new URLSearchParams({
    client_id: requireEnv("BOLIGMAPPA_CLIENT_ID"),
    client_secret: requireEnv("BOLIGMAPPA_CLIENT_SECRET"),
    ...extra,
  });
  const res = await fetch(`${boligmappaUrlar().auth}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => "");
    throw new Error(`Token-kall mot Boligmappa feilet (${res.status}): ${tekst.slice(0, 200)}`);
  }
  return (await res.json()) as BoligmappaTokens;
}

/**
 * Navn og firma fra id_token — bare for visning i UI. Vi validerer ikke
 * signaturen: tokenet kom rett fra Boligmappas token-endepunkt over TLS,
 * og ingenting av tilgang bygger på innholdet.
 */
export function lesIdToken(idToken: string | undefined): { name: string | null; company: string | null } {
  if (!idToken) return { name: null, company: null };
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const name =
      (typeof payload.name === "string" && payload.name) ||
      (typeof payload.preferred_username === "string" && payload.preferred_username) ||
      (typeof payload.email === "string" && payload.email) ||
      null;
    const company =
      (typeof payload.companyName === "string" && payload.companyName) ||
      (typeof payload.company_name === "string" && payload.company_name) ||
      (typeof payload.organization === "string" && payload.organization) ||
      null;
    return { name, company };
  } catch {
    return { name: null, company: null };
  }
}
