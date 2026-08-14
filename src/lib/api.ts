import { NextResponse } from "next/server";
import {
  requireSession,
  UnauthorizedError,
  type SessionContext,
} from "@/lib/supabase/server";

/**
 * Hentar sesjonen, eller eit ferdig 401-svar. Kall som:
 *
 *   const session = await sessionOr401();
 *   if (session instanceof NextResponse) return session;
 */
export async function sessionOr401(): Promise<SessionContext | NextResponse> {
  try {
    return await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Ikkje innlogga" }, { status: 401 });
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
