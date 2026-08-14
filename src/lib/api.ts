import { NextResponse } from "next/server";
import {
  requireSession,
  UnauthorizedError,
  type SessionContext,
} from "@/lib/supabase/server";

/**
 * Henter sesjonen, eller et ferdig 401-svar. Kall slik:
 *
 *   const session = await sessionOr401();
 *   if (session instanceof NextResponse) return session;
 */
export async function sessionOr401(): Promise<SessionContext | NextResponse> {
  try {
    return await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }
    throw err;
  }
}

export function errorResponse(err: unknown, status = 500): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status },
  );
}
