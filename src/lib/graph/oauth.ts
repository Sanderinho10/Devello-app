import { requireEnv, supabaseAdmin } from "@/lib/supabase/server";

/**
 * Scopes for tilkoblet postkasse.
 *
 * Mail.Send er med vilje IKKE med. Prinsippet er låst: appen lager kladd,
 * mennesket trykker send selv. Mail.ReadWrite dekker det vi trenger — å opprette
 * en kladd med vedlegg — uten at vi noen gang kan sende på vegne av brukeren.
 */
export const GRAPH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Mail.Read",
  "Mail.ReadWrite",
];

function tenant(): string {
  return process.env.MS_TENANT || "common";
}

function authorityBase(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0`;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("MS_CLIENT_ID"),
    response_type: "code",
    redirect_uri: requireEnv("MS_REDIRECT_URI"),
    response_mode: "query",
    scope: GRAPH_SCOPES.join(" "),
    state,
    // Sluttbrukeren samtykker selv. Ingen IT-godkjenning fra kundens side.
    prompt: "select_account",
  });
  return `${authorityBase()}/authorize?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("MS_REDIRECT_URI"),
  });
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

async function tokenRequest(extra: Record<string, string>): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: requireEnv("MS_CLIENT_ID"),
    client_secret: requireEnv("MS_CLIENT_SECRET"),
    scope: GRAPH_SCOPES.join(" "),
    ...extra,
  });

  const res = await fetch(`${authorityBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token-kall mot Microsoft feilet (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Henter et gyldig access token for postkassen, og fornyer det om nødvendig.
 * Tokens ligger bare i databasen bak service role — de skal aldri til nettleseren.
 */
export async function accessTokenFor(mailboxId: string): Promise<string> {
  const admin = supabaseAdmin();
  const { data: mailbox, error } = await admin
    .from("mailbox_connections")
    .select("id, access_token, refresh_token, expires_at, status")
    .eq("id", mailboxId)
    .single();

  if (error || !mailbox) {
    throw new Error(`Fant ikke postkassen ${mailboxId}`);
  }

  // Ligger det mer enn et minutt igjen, bruk tokenet vi har.
  const expiresAt = mailbox.expires_at ? new Date(mailbox.expires_at) : null;
  const stillValid = expiresAt && expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid && mailbox.access_token) {
    return mailbox.access_token;
  }

  if (!mailbox.refresh_token) {
    await admin
      .from("mailbox_connections")
      .update({ status: "token_utlopt" })
      .eq("id", mailboxId);
    throw new Error(
      "Postkassen har ikke et gyldig refresh token. Koble til på nytt under Innstillinger.",
    );
  }

  try {
    const tokens = await refreshTokens(mailbox.refresh_token);
    await admin
      .from("mailbox_connections")
      .update({
        access_token: tokens.access_token,
        // Microsoft roterer refresh tokens — behold det nye når vi får ett.
        refresh_token: tokens.refresh_token ?? mailbox.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope,
        status: "aktiv",
      })
      .eq("id", mailboxId);
    return tokens.access_token;
  } catch (err) {
    await admin
      .from("mailbox_connections")
      .update({ status: "token_utlopt" })
      .eq("id", mailboxId);
    throw err;
  }
}
