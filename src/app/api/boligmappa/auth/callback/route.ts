import { NextResponse, type NextRequest } from "next/server";
import { boligmappaMiljo, exchangeBoligmappaCode, lesIdToken } from "@/lib/boligmappa/oauth";
import { currentSession, supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const tilbake = new URL("/ordre/innstillinger", appUrl);

  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL("/login", appUrl));

  const params = request.nextUrl.searchParams;
  const feil = params.get("error_description") ?? params.get("error");
  if (feil) {
    tilbake.searchParams.set("bm_feil", feil);
    return NextResponse.redirect(tilbake);
  }
  const code = params.get("code");
  const state = params.get("state");
  const venta = request.cookies.get("bm_oauth_state")?.value;
  if (!code || !state || state !== venta || state.split(":")[0] !== session.companyId) {
    tilbake.searchParams.set("bm_feil", "Ugyldig svar fra Boligmappa. Prøv på nytt.");
    return NextResponse.redirect(tilbake);
  }

  try {
    const tokens = await exchangeBoligmappaCode(code);
    if (!tokens.refresh_token) throw new Error("Boligmappa ga ikke varig tilgang (refresh token). Sjekk at offline_access er tillatt for klienten.");
    const { name, company } = lesIdToken(tokens.id_token);
    const admin = supabaseAdmin();
    const { error } = await admin.from("boligmappa_connections").upsert(
      {
        company_id: session.companyId,
        environment: boligmappaMiljo(),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        bm_user_name: name,
        bm_company_name: company,
        status: "aktiv",
        status_reason: null,
        created_by: session.userId,
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    tilbake.searchParams.set("bm_koblet", name ?? "1");
  } catch (err) {
    tilbake.searchParams.set("bm_feil", err instanceof Error ? err.message : String(err));
  }
  const response = NextResponse.redirect(tilbake);
  response.cookies.delete("bm_oauth_state");
  return response;
}
