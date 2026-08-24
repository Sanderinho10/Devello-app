import Link from "next/link";
import { BrukLenke } from "./BrukLenke";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Siden innloggingslenka peker på.
 *
 * Den gjør ingenting av seg selv — den slår opp tokenet og viser en knapp.
 * Safe Links i Microsoft 365 henter lenker i innkommende e-post automatisk, og
 * hadde denne siden logget inn på GET, ville skanneren brukt opp lenka før
 * mottakeren fikk se den. Skannere sender ikke skjemaer.
 */
export default async function LoggInnPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: rad } = await supabaseAdmin()
    .from("login_tokens")
    .select("used_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  const utgaatt = rad ? new Date(rad.expires_at) < new Date() : false;

  return (
    <div className="auth-shell">
      <div className="card card-pad auth-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <span className="brand-mark">D</span> Devello
        </div>

        {!rad ? (
          <Beskjed
            tittel="Fant ikke lenken"
            tekst="Lenken er ikke gyldig. Be om en ny fra innloggingssiden."
          />
        ) : rad.used_at ? (
          <Beskjed
            tittel="Lenken er brukt"
            tekst="Innloggingslenker kan bare brukes én gang. Be om en ny, så er du i gang."
          />
        ) : utgaatt ? (
          <Beskjed
            tittel="Lenken har gått ut"
            tekst="Innloggingslenker varer i 30 minutter. Be om en ny."
          />
        ) : (
          <BrukLenke token={token} />
        )}
      </div>
    </div>
  );
}

function Beskjed({ tittel, tekst }: { tittel: string; tekst: string }) {
  return (
    <>
      <h2>{tittel}</h2>
      <p className="muted" style={{ margin: "8px 0 18px" }}>
        {tekst}
      </p>
      <p className="muted tiny">
        <Link href="/login" style={{ textDecoration: "underline" }}>
          Til innlogging
        </Link>
      </p>
    </>
  );
}
