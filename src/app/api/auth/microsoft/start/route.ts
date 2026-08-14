import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/graph/oauth";
import { currentSession } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

/**
 * Startar OAuth-flyten mot Microsoft. Sluttbrukaren samtykker sjølv — det trengst
 * ingen IT-godkjenning frå kunden si side, i motsetnad til M365-connector-vegen.
 */
export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));
  }

  // State bind callbacken til denne brukaren og vernar mot CSRF.
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
