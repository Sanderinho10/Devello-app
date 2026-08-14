import { NextResponse, type NextRequest } from "next/server";
import { getMe } from "@/lib/graph/client";
import { exchangeCode } from "@/lib/graph/oauth";
import { currentSession, supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const settings = new URL("/tilbud/innstillinger", appUrl);

  const session = await currentSession();
  if (!session) return NextResponse.redirect(new URL("/login", appUrl));

  const params = request.nextUrl.searchParams;
  const error = params.get("error_description") ?? params.get("error");
  if (error) {
    settings.searchParams.set("feil", error);
    return NextResponse.redirect(settings);
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("ms_oauth_state")?.value;

  if (!code || !state || state !== expectedState) {
    settings.searchParams.set("feil", "Ugyldig svar fra Microsoft. Prøv på nytt.");
    return NextResponse.redirect(settings);
  }

  // State bærer companyId — sjekk at den fortsatt matcher den innloggede brukeren.
  const [stateCompanyId] = state.split(":");
  if (stateCompanyId !== session.companyId) {
    settings.searchParams.set("feil", "Innloggingen hører til et annet selskap.");
    return NextResponse.redirect(settings);
  }

  try {
    const tokens = await exchangeCode(code);
    const me = await getMe(tokens.access_token);
    const email = me.mail ?? me.userPrincipalName;

    const admin = supabaseAdmin();
    const { error: dbError } = await admin.from("mailbox_connections").upsert(
      {
        company_id: session.companyId,
        provider: "microsoft",
        email_address: email,
        display_name: me.displayName,
        ms_user_id: me.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        scope: tokens.scope,
        status: "aktiv",
      },
      { onConflict: "company_id,email_address" },
    );
    if (dbError) throw new Error(dbError.message);

    settings.searchParams.set("koblet", email);
  } catch (err) {
    settings.searchParams.set(
      "feil",
      err instanceof Error ? err.message : "Ukjent feil ved tilkobling",
    );
  }

  const response = NextResponse.redirect(settings);
  response.cookies.delete("ms_oauth_state");
  return response;
}
