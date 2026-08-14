import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/graph/oauth";
import { currentSession } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

/**
 * Starter OAuth-flyten mot Microsoft. Sluttbrukeren samtykker selv — det trengs
 * ingen IT-godkjenning fra kundens side, i motsetning til M365-connector-veien.
 */
export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  }

  // State binder callbacken til denne brukeren og verner mot CSRF.
  const nonce = randomBytes(16).toString("hex");
  const state = `${session.companyId}:${nonce}`;

  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
