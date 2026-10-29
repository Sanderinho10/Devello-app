import { NextResponse, type NextRequest } from "next/server";

/**
 * Boligmappa sin standard redirect-URI er http://localhost:3000/redirect —
 * den står registrert på clienten til vi har bedt om noe annet. Denne ruta
 * sender svaret videre til vår egen callback med alt som fulgte med (code,
 * state, eventuell feil), så flyten kan testes lokalt før Boligmappa har
 * registrert adressa til app.devello.no. Sett
 * BOLIGMAPPA_REDIRECT_URI=http://localhost:3000/redirect i .env.local; token-
 * bytet bruker samme verdi, slik Boligmappa krever.
 */
export function GET(request: NextRequest) {
  const til = new URL("/api/boligmappa/auth/callback", request.nextUrl.origin);
  til.search = request.nextUrl.search;
  return NextResponse.redirect(til);
}
