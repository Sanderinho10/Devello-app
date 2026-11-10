import { NextResponse } from "next/server";
import { hentTilgang } from "@/lib/billing/tilgang";
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
 *
 * Uten aktivt abonnement svarer API-et 402 — samme sperre som sidene
 * (lib/billing/tilgang.ts). Bare abonnementsruten slipper gjennom, med
 * `{ utenAbonnement: true }`, så man kan velge pakke.
 */
export async function sessionOr401(opts: { utenAbonnement?: boolean } = {}): Promise<SessionContext | NextResponse> {
  let session: SessionContext;
  try {
    session = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Ikke innlogget" }, { status: 401 });
    }
    throw err;
  }
  if (!opts.utenAbonnement) {
    const tilgang = await hentTilgang(session.companyId);
    if (!tilgang.aktiv) {
      return NextResponse.json(
        {
          error:
            tilgang.grunn === "deaktivert"
              ? "Kontoen er deaktivert fordi en faktura ikke er betalt."
              : "Selskapet har ikke et aktivt abonnement. Velg en pakke under Selskap → Abonnement.",
          kode: "abonnement_inaktivt",
        },
        { status: 402 },
      );
    }
  }
  return session;
}

export function errorResponse(err: unknown, status = 500): NextResponse {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : String(err) },
    { status },
  );
}
