import { NextResponse } from "next/server";
import type { SessionContext } from "@/lib/supabase/server";

/**
 * Devello-ansatte: de som fører abonnementsfakturaene for alle selskapene.
 *
 * Ikke en rolle i databasen, men e-postadresser i DEVELLO_ADMIN_EPOST. En
 * kunde som er administrator i sitt eget selskap, skal ikke kunne gi seg
 * selv tilgangen — og en rad i users er nettopp det de styrer.
 */
export function erDevelloAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const liste = (process.env.DEVELLO_ADMIN_EPOST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return liste.includes(email.trim().toLowerCase());
}

/** 403 for alle andre. Kall etter sessionOr401. */
export function develloAdminEllers403(session: SessionContext): NextResponse | null {
  if (erDevelloAdmin(session.email)) return null;
  return NextResponse.json({ error: "Bare for Devello." }, { status: 403 });
}
