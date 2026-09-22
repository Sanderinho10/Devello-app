import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/api-admin";
import { buildBoligmappaAuthorizeUrl } from "@/lib/boligmappa/oauth";
import { currentSession } from "@/lib/supabase/server";

/** Starter OAuth-flyten mot Boligmappa. Bare administratorer kobler til. */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL("/login", appUrl));
  const denied = await requireAdmin(session);
  if (denied) return denied;

  const state = `${session.companyId}:${session.userId}:${randomBytes(16).toString("hex")}`;
  let url: string;
  try {
    url = buildBoligmappaAuthorizeUrl(state);
  } catch (err) {
    const tilbake = new URL("/ordre/innstillinger", appUrl);
    tilbake.searchParams.set("bm_feil", err instanceof Error ? err.message : String(err));
    return NextResponse.redirect(tilbake);
  }
  const response = NextResponse.redirect(url);
  response.cookies.set("bm_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
