import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionOr401 } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Expo sitt format: ExponentPushToken[…] eller ExpoPushToken[…]. */
function lesToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^Expo(nent)?PushToken\[[^\]]{10,200}\]$/.test(t) ? t : null;
}

/**
 * Appen registrerer push-tokenet sitt etter innlogging (og kvar gong
 * appen startar — kallet er idempotent). Same token på ein annan brukar
 * flyttar det: det er telefonen som får varselet, og no er det den nye
 * som er logga inn.
 *
 *   POST   /api/app/push-token  { token, platform? }
 *   DELETE /api/app/push-token  { token }          — ved utlogging
 */
export async function POST(request: NextRequest) {
  const session = await sessionOr401();
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown; platform?: unknown };
    const token = lesToken(body.token);
    if (!token) return NextResponse.json({ error: "Ugyldig push-token." }, { status: 400 });
    const platform = body.platform === "ios" || body.platform === "android" ? body.platform : null;

    const { error } = await supabaseAdmin()
      .from("push_tokens")
      .upsert({ token, user_id: session.userId, platform, last_seen: new Date().toISOString() }, { onConflict: "token" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  const session = await sessionOr401({ utenAbonnement: true });
  if (session instanceof NextResponse) return session;

  try {
    const body = (await request.json().catch(() => ({}))) as { token?: unknown };
    const token = lesToken(body.token);
    if (!token) return NextResponse.json({ error: "Ugyldig push-token." }, { status: 400 });
    // Berre sitt eige: ein kan ikkje slå av varsla til ein kollega.
    const { error } = await supabaseAdmin().from("push_tokens").delete().eq("token", token).eq("user_id", session.userId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
